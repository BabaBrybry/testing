/**
 * SlopSort Social Video Generator — Express Routes
 *
 * HOW TO INTEGRATE INTO server.js:
 * ----------------------------------
 * 1. At the top of server.js, add:
 *      const { registerVideoRoutes } = require('./video_routes');
 *
 * 2. After your existing route definitions (near the Pinterest pin route), add:
 *      registerVideoRoutes(app, pool, isAdminAuth, getSiteSettings);
 *
 * 3. Add ELEVENLABS_API_KEY to your Replit Secrets (or .env).
 *
 * 4. Make sure ffmpeg is available:
 *      In replit.nix, add to deps: pkgs.ffmpeg
 *      In shell.nix or .replit: ensure python3 and pip are available
 *      Run once: pip install Pillow
 *
 * ENDPOINTS:
 *   POST /api/admin/projects/:id/generate-video
 *     Body (JSON): { elevenlabs_voice_id?: string }
 *     Returns: MP4 file download
 *
 *   GET  /api/admin/projects/:id/video-preview
 *     Returns: JSON with video metadata / products that will be used
 */

const { execFile } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch top products for a project and compute agreement percentages.
 * Returns up to 5 products sorted by consensus_rank ASC.
 */
async function fetchTopProducts(pool, projectId) {
  const result = await pool.query(
    `SELECT
       p.id,
       p.product_name  AS name,
       p.consensus_rank,
       p.appearance_count,
       p.confidence_score,
       proj.total_ais,
       proj.title      AS project_title,
       proj.status     AS project_status
     FROM products p
     JOIN projects proj ON proj.id = p.project_id
     WHERE p.project_id = $1
       AND p.consensus_rank IS NOT NULL
       AND p.consensus_rank <= 5
     ORDER BY p.consensus_rank ASC
     LIMIT 5`,
    [projectId]
  );
  return result.rows;
}

/**
 * Compute agreement percentage for a product.
 * Uses appearance_count / total_ais * 100, clamped to [0, 100].
 */
function computeAgreementPct(product) {
  if (!product.total_ais || product.total_ais === 0) return 0;
  return Math.min(100, Math.round((product.appearance_count / product.total_ais) * 100));
}

/**
 * Run generate_video.py as a child process.
 * Returns a promise resolving to { success, output } or rejecting with error.
 */
function runVideoGenerator(dataJson, outputPath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'generate_video.py');

    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`generate_video.py not found at ${scriptPath}`));
    }

    const args = ['--data', dataJson, '--output', outputPath];

    // Try python3 first, fall back to python
    const pythonBin = process.env.PYTHON_BIN || 'python3';

    execFile(pythonBin, [scriptPath, ...args], {
      timeout: 120_000,  // 2 minutes max
      maxBuffer: 10 * 1024 * 1024,  // 10 MB
    }, (error, stdout, stderr) => {
      if (stderr) {
        console.log('[video-gen] Python stderr:', stderr.slice(-2000));
      }
      if (error) {
        return reject(new Error(`Video generation failed: ${error.message}\n${stderr?.slice(-1000)}`));
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.error || 'Unknown video generation error'));
        }
      } catch (parseErr) {
        reject(new Error(`Failed to parse generate_video.py output: ${stdout}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

function registerVideoRoutes(app, pool, isAdminAuth, getSiteSettings) {

  // ------------------------------------------------------------------
  // GET /api/admin/projects/:id/video-preview
  // Returns JSON: what products/data will be used for the video
  // ------------------------------------------------------------------
  app.get('/api/admin/projects/:id/video-preview', async (req, res) => {
    if (!isAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

    const projectId = parseInt(req.params.id, 10);
    if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

    try {
      const products = await fetchTopProducts(pool, projectId);
      if (!products.length) {
        return res.status(404).json({ error: 'No ranked products found for this project' });
      }

      const projectTitle = products[0].project_title;
      const projectStatus = products[0].project_status;
      const aiCount = products[0].total_ais || 5;

      const preview = {
        project_id: projectId,
        project_title: projectTitle,
        project_status: projectStatus,
        ai_count: aiCount,
        products: products.map(p => ({
          rank: p.consensus_rank,
          name: p.name,
          agreement_pct: computeAgreementPct(p),
          appearance_count: p.appearance_count,
        })),
        estimated_duration_sec: 3 + products.length * 4.5 + 4,
        has_elevenlabs: !!(process.env.ELEVENLABS_API_KEY),
        format: '1080x1920 (9:16 vertical)',
      };

      res.json(preview);
    } catch (err) {
      console.error('[video-preview] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });


  // ------------------------------------------------------------------
  // POST /api/admin/projects/:id/generate-video
  // Generates and streams an MP4 file download
  // ------------------------------------------------------------------
  app.post('/api/admin/projects/:id/generate-video', async (req, res) => {
    if (!isAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

    const projectId = parseInt(req.params.id, 10);
    if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

    const voiceId = req.body?.elevenlabs_voice_id || '21m00Tcm4TlvDq8ikWAM';

    try {
      // 1. Fetch top products
      const products = await fetchTopProducts(pool, projectId);
      if (!products.length) {
        return res.status(404).json({ error: 'No top-5 ranked products found. Publish the ranking first.' });
      }

      const projectTitle = products[0].project_title;
      const aiCount = products[0].total_ais || 5;

      // 2. Get site settings for URL
      let siteUrl = 'slopsort.com';
      try {
        const settings = await getSiteSettings();
        if (settings?.site_name) siteUrl = 'slopsort.com'; // Could read from settings
      } catch (_) {}

      // 3. Build data payload for Python script
      const videoData = {
        title: projectTitle,
        ai_count: aiCount,
        site_url: siteUrl,
        elevenlabs_key: process.env.ELEVENLABS_API_KEY || '',
        elevenlabs_voice_id: voiceId,
        products: products.map(p => ({
          name: p.name,
          consensus_rank: p.consensus_rank,
          agreement_pct: computeAgreementPct(p),
        })),
      };

      // 4. Create a temp output path
      const tmpFile = path.join(os.tmpdir(), `slopsort_video_${projectId}_${Date.now()}.mp4`);

      console.log(`[video-gen] Generating video for project ${projectId}: "${projectTitle}"`);

      // 5. Run the Python generator
      await runVideoGenerator(JSON.stringify(videoData), tmpFile);

      // 6. Sanity-check the output
      if (!fs.existsSync(tmpFile)) {
        return res.status(500).json({ error: 'Video file was not created' });
      }
      const stat = fs.statSync(tmpFile);
      if (stat.size < 1000) {
        fs.unlinkSync(tmpFile);
        return res.status(500).json({ error: 'Generated video file is too small (likely corrupt)' });
      }

      // 7. Stream it as a download
      const safeName = projectTitle
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_+/g, '_')
        .toLowerCase()
        .slice(0, 60);
      const filename = `slopsort_${safeName}_top5.mp4`;

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', stat.size);

      const stream = fs.createReadStream(tmpFile);
      stream.pipe(res);
      stream.on('end', () => {
        // Clean up temp file after sending
        fs.unlink(tmpFile, () => {});
      });
      stream.on('error', (streamErr) => {
        console.error('[video-gen] Stream error:', streamErr);
        fs.unlink(tmpFile, () => {});
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream video file' });
        }
      });

    } catch (err) {
      console.error('[video-gen] Error:', err);
      res.status(500).json({ error: err.message || 'Video generation failed' });
    }
  });

}

module.exports = { registerVideoRoutes };
