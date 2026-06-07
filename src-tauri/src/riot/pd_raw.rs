// Status-surfacing siblings of `http::pd_get`/`pd_put`/`pd_post`. Same Node
// subprocess plumbing, but return `(status, body)` instead of swallowing the
// status when the response is a non-2xx with a non-empty body. The PUT/POST
// variants ride along as a complete API so the per-domain migration PRs that
// follow the canary are mechanical edits, not "add a new export, then
// migrate" — that's why the unused ones carry `#[allow(dead_code)]`.
//
// Kept separate from `pd_session.rs` so each file stays under the 500-line
// ceiling and so the wrapper-logic + tests aren't bloated by Node-script
// duplication.

use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use super::http::PLATFORM;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Verb {
    Get,
    Put,
    Post,
}

/// Extract the HTTP status code from the stderr emitted by the Node scripts.
/// All three (`pd_get`, `pd_put`, `pd_post`) write `HTTP {code} enc=...` at
/// the start of stderr. Returns `None` for network failures / timeouts where
/// no response status was reached.
pub(super) fn parse_http_status(stderr: &str) -> Option<u16> {
    let idx = stderr.find("HTTP ")?;
    let tail = &stderr[idx + 5..];
    let end = tail
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(tail.len());
    if end == 0 {
        return None;
    }
    tail[..end].parse().ok()
}

#[allow(dead_code)]
pub(super) fn pd_get_raw(
    shard: &str,
    path: &str,
    access_token: &str,
    entitlements: &str,
    client_version: &str,
) -> Result<(u16, String), String> {
    run_pd_node(
        Verb::Get,
        shard,
        path,
        "",
        access_token,
        entitlements,
        client_version,
    )
}

#[allow(dead_code)]
pub(super) fn pd_put_raw(
    shard: &str,
    path: &str,
    body: &str,
    access_token: &str,
    entitlements: &str,
    client_version: &str,
) -> Result<(u16, String), String> {
    run_pd_node(
        Verb::Put,
        shard,
        path,
        body,
        access_token,
        entitlements,
        client_version,
    )
}

#[allow(dead_code)]
pub(super) fn pd_post_raw(
    shard: &str,
    path: &str,
    body: &str,
    access_token: &str,
    entitlements: &str,
    client_version: &str,
) -> Result<(u16, String), String> {
    run_pd_node(
        Verb::Post,
        shard,
        path,
        body,
        access_token,
        entitlements,
        client_version,
    )
}

fn run_pd_node(
    verb: Verb,
    shard: &str,
    path: &str,
    body: &str,
    access_token: &str,
    entitlements: &str,
    client_version: &str,
) -> Result<(u16, String), String> {
    use base64::Engine;
    let url = format!("https://pd.{}.a.pvp.net{}", shard, path);
    let script = match verb {
        Verb::Get => format!(
            r#"const https=require('https');const zlib=require('zlib');const u=new URL('{}');const r=https.request({{hostname:u.hostname,path:u.pathname,headers:{{'Authorization':'Bearer {}','X-Riot-Entitlements-JWT':'{}','X-Riot-ClientPlatform':'{}','X-Riot-ClientVersion':'{}'}}}},res=>{{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{{let buf=Buffer.concat(chunks);const enc=res.headers['content-encoding'];process.stderr.write('HTTP '+res.statusCode+' enc='+(enc||'none')+' raw='+buf.length+' ');if(enc==='gzip'){{try{{buf=zlib.gunzipSync(buf)}}catch(e){{process.stderr.write('gunzip err:'+e.message+' ')}}}}else if(enc==='deflate'){{try{{buf=zlib.inflateSync(buf)}}catch(e){{}}}}const out=buf.toString();process.stderr.write('len='+out.length);process.stdout.write(out)}})}});r.on('error',e=>{{process.stderr.write('err:'+e.message);process.exit(1)}});r.setTimeout(15000,()=>{{r.destroy();process.stderr.write('timeout');process.exit(1)}});r.end()"#,
            url, access_token, entitlements, PLATFORM, client_version
        ),
        Verb::Put | Verb::Post => {
            let method = if verb == Verb::Put { "PUT" } else { "POST" };
            let b64_body = base64::engine::general_purpose::STANDARD.encode(body.as_bytes());
            format!(
                r#"const https=require('https');const zlib=require('zlib');const u=new URL('{}');const b=Buffer.from('{}','base64').toString();const r=https.request({{hostname:u.hostname,path:u.pathname,method:'{}',headers:{{'Authorization':'Bearer {}','X-Riot-Entitlements-JWT':'{}','X-Riot-ClientPlatform':'{}','X-Riot-ClientVersion':'{}','Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}}}},res=>{{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{{let buf=Buffer.concat(chunks);const enc=res.headers['content-encoding'];process.stderr.write('HTTP '+res.statusCode+' enc='+(enc||'none')+' raw='+buf.length+' ');if(enc==='gzip'){{try{{buf=zlib.gunzipSync(buf)}}catch(e){{process.stderr.write('gunzip err:'+e.message+' ')}}}}else if(enc==='deflate'){{try{{buf=zlib.inflateSync(buf)}}catch(e){{}}}}const out=buf.toString();process.stderr.write('len='+out.length);process.stdout.write(out)}})}});r.on('error',e=>{{process.stderr.write('err:'+e.message);process.exit(1)}});r.setTimeout(15000,()=>{{r.destroy();process.stderr.write('timeout');process.exit(1)}});r.end(b)"#,
                url, b64_body, method, access_token, entitlements, PLATFORM, client_version
            )
        }
    };

    let mut cmd = Command::new("node");
    cmd.args(["-e", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let body_out = String::from_utf8_lossy(&output.stdout).to_string();

    if !output.status.success() {
        return Err(format!("{}: {}", path, stderr.trim()));
    }

    match parse_http_status(&stderr) {
        Some(s) => Ok((s, body_out)),
        None => Err(format!(
            "{}: no HTTP status in stderr ({})",
            path,
            stderr.trim()
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_http_status_from_get_stderr() {
        let stderr = "HTTP 200 enc=gzip raw=512 len=1024";
        assert_eq!(parse_http_status(stderr), Some(200));
    }

    #[test]
    fn parses_http_status_from_put_stderr() {
        let stderr = "HTTP 401 enc=none raw=42 len=42";
        assert_eq!(parse_http_status(stderr), Some(401));
    }

    #[test]
    fn parses_http_status_with_3_digit_codes() {
        let stderr = "HTTP 503 enc=none raw=0 len=0";
        assert_eq!(parse_http_status(stderr), Some(503));
    }

    #[test]
    fn no_status_on_network_err() {
        let stderr = "err:ECONNREFUSED 127.0.0.1:443";
        assert_eq!(parse_http_status(stderr), None);
    }

    #[test]
    fn no_status_on_timeout() {
        let stderr = "timeout";
        assert_eq!(parse_http_status(stderr), None);
    }
}
