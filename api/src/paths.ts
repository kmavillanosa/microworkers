import { resolve } from 'node:path';

const apiRoot = process.cwd();
/** In Docker set REPO_ROOT to a writable path (e.g. /app/data). Otherwise parent of api root. */
const repoRoot =
  process.env.REPO_ROOT && process.env.REPO_ROOT.length > 0
    ? resolve(process.env.REPO_ROOT)
    : resolve(apiRoot, '..');

const pythonExe =
  process.env.REELS_PYTHON_EXE && process.env.REELS_PYTHON_EXE.length > 0
    ? process.env.REELS_PYTHON_EXE
    : process.platform === 'win32'
      ? resolve(repoRoot, '.reels-venv', 'Scripts', 'python.exe')
      : resolve(repoRoot, '.reels-venv', 'bin', 'python')

export const paths = {
  apiRoot,
  repoRoot,
  credentialsDir: resolve(repoRoot, 'assets', 'credentials'),
  youtubeTokenFile: resolve(repoRoot, 'assets', 'credentials', 'youtube-token.json'),
  facebookTokenFile: resolve(repoRoot, 'assets', 'credentials', 'facebook-token.json'),
  dbFile: resolve(repoRoot, 'assets', 'db', 'accounts.db'),
  clipsDir: resolve(repoRoot, 'assets', 'game-clips'),
  /** Customer-uploaded videos for orders; not listed in catalog, not visible to other customers */
  orderClipsDir: resolve(repoRoot, 'assets', 'order-clips'),
  fontsDir: resolve(repoRoot, 'assets', 'fonts'),
  piperVoicesDir: resolve(repoRoot, 'assets', 'voices', 'piper'),
  outputDir: resolve(repoRoot, 'output'),
  /** Cached downloaded images (e.g. RSS thumbnails) to avoid re-fetching. */
  imageCacheDir: resolve(repoRoot, 'assets', 'cache', 'images'),
  scriptsDir: resolve(repoRoot, 'scripts'),
  pythonExe,
  transcribeScript: resolve(repoRoot, 'transcribe_clip.py'),
  generatorScript: resolve(repoRoot, 'reels_generator.py'),
};
