"use client";

import { FormEvent, useCallback, useRef, useState } from "react";
import { apiBase, apiErrorMessage, apiFetch, ensureCsrfToken, resetCsrfToken } from "../lib/api";

type UploadState =
  | { phase: "idle" }
  | { phase: "preparing"; fileName: string; fileSize: number; fileType: string }
  | {
      phase: "uploading";
      fileName: string;
      fileSize: number;
      fileType: string;
      loaded: number;
      total: number;
    }
  | { phase: "processing"; fileName: string; fileSize: number; fileType: string }
  | { phase: "error"; message: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function detectFormat(fileName: string): "PDF" | "XLSX" | "CSV" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".xlsx")) return "XLSX";
  return "CSV";
}

async function completeUploadWithProgress(input: {
  orgId: string;
  uploadId: string;
  file: File;
  onProgress: (loaded: number, total: number) => void;
}): Promise<{ status: number; body: { message?: string; document?: { id: string } } }> {
  const token = await ensureCsrfToken();
  const formData = new FormData();
  formData.append("file", input.file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `${apiBase()}/organizations/${input.orgId}/documents/uploads/${input.uploadId}/complete`,
    );
    xhr.withCredentials = true;
    xhr.setRequestHeader("x-csrf-token", token);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        input.onProgress(event.loaded, event.total);
      }
    };
    xhr.onload = () => {
      let body: { message?: string; document?: { id: string } } = {};
      try {
        body = xhr.responseText ? (JSON.parse(xhr.responseText) as typeof body) : {};
      } catch {
        body = { message: xhr.responseText || undefined };
      }
      if (xhr.status === 403) {
        resetCsrfToken();
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formData);
  });
}

export function DocumentUploadForm({
  orgId,
  disabled,
  onUploaded,
}: {
  orgId: string;
  disabled?: boolean;
  onUploaded: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const [dragOver, setDragOver] = useState(false);

  const uploadFile = useCallback(
    async (file: File) => {
      const format = detectFormat(file.name);
      setState({
        phase: "preparing",
        fileName: file.name,
        fileSize: file.size,
        fileType: format,
      });
      try {
        const created = await apiFetch<{ upload?: { uploadId: string }; message?: string }>(
          `/organizations/${orgId}/documents/uploads`,
          {
            method: "POST",
            json: {
              filename: file.name,
              declaredMimeType: file.type || undefined,
              declaredFormat: format,
              expectedByteSize: file.size,
            },
          },
        );
        if (created.status >= 400 || !created.body.upload) {
          throw new Error(apiErrorMessage(created.body, "Unable to start upload"));
        }

        setState({
          phase: "uploading",
          fileName: file.name,
          fileSize: file.size,
          fileType: format,
          loaded: 0,
          total: file.size,
        });

        const completed = await completeUploadWithProgress({
          orgId,
          uploadId: created.body.upload.uploadId,
          file,
          onProgress: (loaded, total) => {
            setState({
              phase: "uploading",
              fileName: file.name,
              fileSize: file.size,
              fileType: format,
              loaded,
              total,
            });
          },
        });
        if (completed.status >= 400) {
          throw new Error(apiErrorMessage(completed.body, "Upload completion failed"));
        }

        setState({
          phase: "processing",
          fileName: file.name,
          fileSize: file.size,
          fileType: format,
        });
        await onUploaded();
        setState({ phase: "idle" });
      } catch (err) {
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [orgId, onUploaded],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    await uploadFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  const busy = state.phase === "uploading" || state.phase === "preparing";

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className={`mb-10 rounded-2xl border border-dashed p-5 ${
        dragOver ? "border-pine bg-pine/5" : "border-line bg-white/50"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        if (disabled) return;
        const file = event.dataTransfer.files?.[0];
        if (file) void uploadFile(file);
      }}
    >
      <label className="block text-sm text-ink">
        Financial report (PDF, XLSX, or CSV)
        <input
          ref={inputRef}
          className="mt-2 block w-full max-w-md border border-line bg-white px-3 py-2"
          type="file"
          name="file"
          accept=".pdf,.xlsx,.csv,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          disabled={disabled || busy}
        />
      </label>
      <p className="mt-2 text-sm text-muted">Drag and drop a file here, or choose a file to upload.</p>

      {state.phase !== "idle" && state.phase !== "error" ? (
        <div className="mt-4 text-sm text-muted">
          <p>
            {state.fileName} · {state.fileType} · {formatBytes(state.fileSize)}
          </p>
          {state.phase === "uploading" ? (
            <div
              className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((state.loaded / Math.max(state.total, 1)) * 100)}
            >
              <div
                className="h-full bg-pine transition-[width]"
                style={{
                  width: `${Math.round((state.loaded / Math.max(state.total, 1)) * 100)}%`,
                }}
              />
            </div>
          ) : null}
          <p className="mt-2">
            {state.phase === "preparing"
              ? "Preparing upload…"
              : state.phase === "uploading"
                ? `Uploading… ${formatBytes(state.loaded)} / ${formatBytes(state.total)}`
                : "Upload complete — processing started"}
          </p>
        </div>
      ) : null}

      {state.phase === "error" ? <p className="mt-3 text-sm text-copper">{state.message}</p> : null}

      <button
        className="mt-4 rounded-full bg-pine px-5 py-2 text-paper disabled:opacity-50"
        type="submit"
        disabled={disabled || busy}
      >
        {busy ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
