/**
 * GitHub integration helpers for ChangeSync Document Library.
 * Reads files from the configured repo's sample-documents folder
 * and provides download utilities for importing them into the platform.
 */

import { ENV } from "./_core/env";

const GH_API = "https://api.github.com";

function ghHeaders() {
  return {
    Authorization: `Bearer ${ENV.githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  downloadUrl: string;
  folder: string;
  mimeType: string;
}

function inferMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt: "application/vnd.ms-powerpoint",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    csv: "text/csv",
    txt: "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}

/**
 * Recursively list all files under sample-documents/ in the configured repo.
 * Returns a flat array of GitHubFile objects grouped by their immediate subfolder.
 */
export async function listGitHubSampleDocs(): Promise<GitHubFile[]> {
  const repo = ENV.githubRepo;
  if (!ENV.githubToken) throw new Error("GITHUB_TOKEN is not configured");

  // Use the git trees API with recursive flag for efficiency
  const treeRes = await fetch(
    `${GH_API}/repos/${repo}/git/trees/main?recursive=1`,
    { headers: ghHeaders() }
  );
  if (!treeRes.ok) {
    const err = await treeRes.json().catch(() => ({}));
    throw new Error(`GitHub API error: ${(err as { message?: string }).message ?? treeRes.statusText}`);
  }
  const treeData = await treeRes.json() as { tree: { type: string; path: string; sha: string; size?: number }[] };

  const files: GitHubFile[] = [];
  for (const item of treeData.tree) {
    if (item.type !== "blob") continue;
    if (!item.path.startsWith("sample-documents/")) continue;
    // Skip files directly in sample-documents/ root (no subfolder)
    const relativePath = item.path.replace("sample-documents/", "");
    const parts = relativePath.split("/");
    if (parts.length < 2) continue; // skip root-level files

    const folder = parts[0];
    const name = parts.slice(1).join("/");
    const downloadUrl = `https://raw.githubusercontent.com/${repo}/main/${item.path}`;

    files.push({
      name,
      path: item.path,
      sha: item.sha,
      size: item.size ?? 0,
      downloadUrl,
      folder,
      mimeType: inferMimeType(name),
    });
  }

  return files;
}

/**
 * Download a file from GitHub by its raw download URL.
 * Returns the file content as a Buffer.
 */
export async function downloadGitHubFile(downloadUrl: string): Promise<Buffer> {
  const res = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${ENV.githubToken}`,
    },
  });
  if (!res.ok) throw new Error(`Failed to download file: ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Push a file to the GitHub repo under documents/uploaded/<filename>.
 * Creates or updates the file at the given path.
 */
export async function pushFileToGitHub(
  filePath: string,
  fileBuffer: Buffer,
  commitMessage: string
): Promise<string> {
  const repo = ENV.githubRepo;
  if (!ENV.githubToken) throw new Error("GITHUB_TOKEN is not configured");

  const content = fileBuffer.toString("base64");

  // Check if file already exists (to get its SHA for update)
  let existingSha: string | undefined;
  try {
    const checkRes = await fetch(`${GH_API}/repos/${repo}/contents/${filePath}`, {
      headers: ghHeaders(),
    });
    if (checkRes.ok) {
      const existing = await checkRes.json() as { sha?: string };
      existingSha = existing.sha;
    }
  } catch {
    // File doesn't exist yet — that's fine
  }

  const body: Record<string, unknown> = {
    message: commitMessage,
    content,
  };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(`${GH_API}/repos/${repo}/contents/${filePath}`, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub push failed: ${(err as { message?: string }).message ?? res.statusText}`);
  }

  const data = await res.json() as { content?: { html_url?: string } };
  return data.content?.html_url ?? `https://github.com/${repo}/blob/main/${filePath}`;
}
