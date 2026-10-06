// Lightweight GitHub Releases check — deliberately NOT `tauri-plugin-updater`,
// which needs a signed update manifest hosted somewhere; this just reads the
// public, unauthenticated GitHub Releases API and hands the user a link.
//
// TODO: update repo URL once this project has a public GitHub repository —
// `C:\prabhupadaconnectv3` isn't a git repo yet (confirmed directly), so this
// placeholder will 404 until one exists. `checkForUpdate` treats a 404 (or
// any other fetch failure) the same as "couldn't reach GitHub" rather than
// a crash.
const GITHUB_API_URL = 'https://api.github.com/repos/OWNER/REPO/releases/latest'

export interface UpdateInfo {
  latestVersion: string
  releaseUrl: string
  publishedAt: string
  isNewer: boolean
}

/** Parses a `major.minor.patch` version (an optional leading "v" is
 * stripped first, matching GitHub's usual `v1.2.3` tag convention) into its
 * three numeric parts, defaulting any missing or non-numeric part to `0` so
 * a malformed tag compares as old rather than throwing. */
function parseVersion(v: string): [number, number, number] {
  const parts = v.replace(/^v/i, '').split('.').map((p) => {
    const n = parseInt(p, 10)
    return Number.isFinite(n) ? n : 0
  })
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

function isNewerVersion(latest: string, current: string): boolean {
  const [la, lb, lc] = parseVersion(latest)
  const [ca, cb, cc] = parseVersion(current)
  if (la !== ca) return la > ca
  if (lb !== cb) return lb > cb
  return lc > cc
}

/** `currentVersion` is the real running app version (`getVersion()` from
 * `@tauri-apps/api/app`, which reads `tauri.conf.json` at runtime) — passed
 * in by the caller rather than hardcoded here, so this can never drift out
 * of sync with the actual build the way a duplicated literal could. */
export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(GITHUB_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { tag_name: string; html_url: string; published_at: string }
    const latestVersion = data.tag_name.replace(/^v/i, '')
    return {
      latestVersion,
      releaseUrl: data.html_url,
      publishedAt: data.published_at,
      isNewer: isNewerVersion(latestVersion, currentVersion),
    }
  } catch {
    return null
  }
}
