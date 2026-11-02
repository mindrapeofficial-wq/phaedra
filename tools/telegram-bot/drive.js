const ROOT = "1HMbGsfaj7vDyF7QkyWgTTqSJ06JJr2Dr";

export async function archiveCover(userId, imageBase64) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;
  const signal = AbortSignal.timeout(60_000);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", signal,
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: GOOGLE_REFRESH_TOKEN, grant_type: "refresh_token" }),
  });
  if (!tokenResponse.ok) throw new Error("Drive authorization unavailable");
  const { access_token } = await tokenResponse.json();
  if (!access_token) throw new Error("Drive authorization unavailable");
  const headers = { Authorization: `Bearer ${access_token}` };
  const folderName = `Cliente ${Number(userId)}`;
  const parent = process.env.GOOGLE_DRIVE_FOLDER_ID || ROOT;
  if (!/^[\w-]+$/.test(parent)) throw new Error("Invalid Drive folder");
  const query = new URLSearchParams({ q: `'${parent}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: "files(id)", pageSize: "1" });
  const listing = await fetch(`https://www.googleapis.com/drive/v3/files?${query}`, { headers, signal });
  if (!listing.ok) throw new Error("Drive folder unavailable");
  let folder = (await listing.json()).files?.[0]?.id;
  if (!folder) {
    const created = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder", parents: [parent] }),
    });
    if (!created.ok) throw new Error("Could not create client folder");
    folder = (await created.json()).id;
  }
  const bytes = Buffer.from(imageBase64, "base64");
  const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink", {
    method: "POST", signal,
    headers: { ...headers, "Content-Type": "application/json", "X-Upload-Content-Type": "image/png", "X-Upload-Content-Length": String(bytes.length) },
    body: JSON.stringify({ name: `Portada Pro ${new Date().toISOString().replace(/[:.]/g, "-")}.png`, parents: [folder] }),
  });
  if (!start.ok) throw new Error("Could not start Drive upload");
  const location = start.headers.get("location");
  if (!location || new URL(location).origin !== "https://www.googleapis.com") throw new Error("Invalid Drive upload location");
  const upload = await fetch(location, { method: "PUT", headers: { ...headers, "Content-Type": "image/png" }, body: bytes, signal });
  if (!upload.ok) throw new Error("Drive upload failed");
  return upload.json();
}
