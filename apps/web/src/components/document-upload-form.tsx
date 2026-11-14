"use client";

import { FormEvent, useCallback, useMemo, useRef, useState } from "react";
import { apiBase, apiErrorMessage, apiFetch, ensureCsrfToken, resetCsrfToken } from "../lib/api";
import {
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_MAX_BYTES,
  detectDocumentFormat,
  formatUploadBytes,
  validateDocumentUploadClient,
} from "../lib/document-upload-rules";
import { Alert, Button, ProgressBar } from "./ui";

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
  | { phase: "success"; fileName: string }
  | { phase: "error"; message: string };

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
  existingFilenames = [],
  onUploaded,
}: {
  orgId: string;
  disabled?: boolean;
  existingFilenames?: string[];
  onUploaded: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const [dragOver, setDragOver] = useState(false);

  const busy = state.phase === "uploading" || state.phase === "preparing";

  const uploadProgress = useMemo(() => {
    if (state.phase !== "uploading") return null;
    return Math.round((state.loaded / Math.max(state.total, 1)) * 100);
  }, [state]);

  const uploadFile = useCallback(
    async (file: File) => {
      const clientError = validateDocumentUploadClient(file, existingFilenames);
      if (clientError) {
        setState({ phase: "error", message: clientError });
        return;
      }
      const format = detectDocumentFormat(file.name)!;
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
        setState({ phase: "success", fileName: file.name });
      } catch (err) {
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [orgId, onUploaded, existingFilenames],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setState({ phase: "error", message: "Choose a PDF, XLSX or CSV file to upload." });
      return;
    }
    await uploadFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className={`rounded-2xl border border-dashed p-5 sm:p-6 ${
        dragOver ? "border-emerald bg-emerald/5" : "border-border bg-surface"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        if (disabled || busy) return;
        const file = event.dataTransfer.files?.[0];
        if (file) void uploadFile(file);
      }}
      aria-busy={busy || undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-navy">Upload financial statement</h2>
          <p className="mt-1 text-sm text-text-secondary">
            PDF, XLSX or CSV · max {formatUploadBytes(DOCUMENT_UPLOAD_MAX_BYTES)}. Files are
            quarantined, scanned, then extracted with source evidence.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </Button>
      </div>

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        name="file"
        accept={DOCUMENT_UPLOAD_ACCEPT}
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void uploadFile(file);
          event.currentTarget.value = "";
        }}
      />

      <p className="mt-4 rounded-xl border border-border bg-workspace px-4 py-6 text-center text-sm text-text-secondary">
        Drag and drop a file here, or use Choose file. Keyboard users can activate Choose file and
        select from the system picker.
      </p>

      {state.phase !== "idle" && state.phase !== "error" && state.phase !== "success" ? (
        <div className="mt-4 space-y-2 text-sm text-text-secondary">
          <p className="font-medium text-navy">
            {state.fileName} · {state.fileType} · {formatUploadBytes(state.fileSize)}
          </p>
          {state.phase === "uploading" && uploadProgress != null ? (
            <ProgressBar value={uploadProgress} label={`Uploading ${uploadProgress}%`} />
          ) : null}
          <p>
            {state.phase === "preparing"
              ? "Preparing secure upload…"
              : state.phase === "uploading"
                ? `Uploading… ${formatUploadBytes(state.loaded)} / ${formatUploadBytes(state.total)}`
                : "Upload complete — scanning and extraction will continue in the background"}
          </p>
        </div>
      ) : null}

      {state.phase === "success" ? (
        <div className="mt-4">
          <Alert tone="success" title="Upload received">
            {state.fileName} is queued for scanning and extraction. Open the document to follow
            processing.
          </Alert>
        </div>
      ) : null}

      {state.phase === "error" ? (
        <div className="mt-4">
          <Alert tone="error" title="Upload blocked">
            {state.message}
          </Alert>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" loading={busy} disabled={disabled}>
          {busy ? "Uploading…" : "Upload"}
        </Button>
        {state.phase === "error" || state.phase === "success" ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setState({ phase: "idle" })}
          >
            Dismiss
          </Button>
        ) : null}
      </div>
    </form>
  );
}
