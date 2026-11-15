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

type SelectedFile = {
  file: File;
  fileName: string;
  fileSize: number;
  fileType: string;
  advisoryWarning: string | null;
};

type UploadState =
  | { phase: "idle" }
  | { phase: "selected"; selected: SelectedFile }
  | { phase: "preparing"; selected: SelectedFile }
  | {
      phase: "uploading";
      selected: SelectedFile;
      loaded: number;
      total: number;
    }
  | { phase: "processing"; selected: SelectedFile }
  | { phase: "success"; fileName: string }
  | { phase: "error"; message: string; selected?: SelectedFile };

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

function toSelectedFile(file: File, existingFilenames: string[]): SelectedFile | { error: string } {
  const validation = validateDocumentUploadClient(file, existingFilenames);
  if (validation.error) return { error: validation.error };
  const format = detectDocumentFormat(file.name)!;
  return {
    file,
    fileName: file.name,
    fileSize: file.size,
    fileType: format,
    advisoryWarning: validation.advisoryWarning,
  };
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

  const selectFile = useCallback(
    (file: File) => {
      const result = toSelectedFile(file, existingFilenames);
      if ("error" in result) {
        setState({ phase: "error", message: result.error });
        return;
      }
      setState({ phase: "selected", selected: result });
    },
    [existingFilenames],
  );

  const uploadSelected = useCallback(
    async (selected: SelectedFile) => {
      setState({ phase: "preparing", selected });
      try {
        const created = await apiFetch<{ upload?: { uploadId: string }; message?: string }>(
          `/organizations/${orgId}/documents/uploads`,
          {
            method: "POST",
            json: {
              filename: selected.fileName,
              declaredMimeType: selected.file.type || undefined,
              declaredFormat: selected.fileType,
              expectedByteSize: selected.fileSize,
            },
          },
        );
        if (created.status >= 400 || !created.body.upload) {
          throw new Error(apiErrorMessage(created.body, "Unable to start upload"));
        }

        setState({
          phase: "uploading",
          selected,
          loaded: 0,
          total: selected.fileSize,
        });

        const completed = await completeUploadWithProgress({
          orgId,
          uploadId: created.body.upload.uploadId,
          file: selected.file,
          onProgress: (loaded, total) => {
            setState({
              phase: "uploading",
              selected,
              loaded,
              total,
            });
          },
        });
        if (completed.status >= 400) {
          throw new Error(apiErrorMessage(completed.body, "Upload completion failed"));
        }

        setState({ phase: "processing", selected });
        await onUploaded();
        setState({ phase: "success", fileName: selected.fileName });
      } catch (err) {
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "Upload failed",
          selected,
        });
      }
    },
    [orgId, onUploaded],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || busy) return;
    if (state.phase === "selected") {
      await uploadSelected(state.selected);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setState({
        phase: "error",
        message: "Choose a PDF, XLSX or CSV file to upload.",
      });
      return;
    }
    const result = toSelectedFile(file, existingFilenames);
    if ("error" in result) {
      setState({ phase: "error", message: result.error });
      return;
    }
    await uploadSelected(result);
    if (inputRef.current) inputRef.current.value = "";
  }

  const selectedSummary =
    state.phase === "selected" ||
    state.phase === "preparing" ||
    state.phase === "uploading" ||
    state.phase === "processing"
      ? state.selected
      : state.phase === "error" && state.selected
        ? state.selected
        : null;

  return (
    <form
      id="document-upload"
      onSubmit={(event) => void onSubmit(event)}
      className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${
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
        if (file) selectFile(file);
      }}
      aria-busy={busy || undefined}
      data-testid="document-upload-form"
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
          if (file) selectFile(file);
          event.currentTarget.value = "";
        }}
      />

      <div
        className={`mt-4 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragOver
            ? "border-emerald bg-emerald/10"
            : "border-border bg-workspace"
        }`}
        role="presentation"
      >
        <p className="text-sm font-medium text-navy">
          {dragOver ? "Drop to select file" : "Drag and drop a statement here"}
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          Or use Choose file. Keyboard users can activate Choose file and select from the system
          picker.
        </p>
      </div>

      {selectedSummary ? (
        <div
          className="mt-4 rounded-xl border border-border bg-workspace px-4 py-3 text-sm"
          data-testid="selected-file-summary"
        >
          <p className="font-medium text-navy">{selectedSummary.fileName}</p>
          <p className="mt-1 text-text-secondary">
            Format {selectedSummary.fileType} · {formatUploadBytes(selectedSummary.fileSize)}
          </p>
          {selectedSummary.advisoryWarning ? (
            <div className="mt-3">
              <Alert tone="warning" title="Filename already used">
                {selectedSummary.advisoryWarning}
              </Alert>
            </div>
          ) : null}
        </div>
      ) : null}

      {state.phase === "uploading" && uploadProgress != null ? (
        <div className="mt-4 space-y-2 text-sm text-text-secondary">
          <ProgressBar value={uploadProgress} label={`Uploading ${uploadProgress}%`} />
          <p>
            Uploading… {formatUploadBytes(state.loaded)} / {formatUploadBytes(state.total)}
          </p>
        </div>
      ) : null}

      {state.phase === "preparing" ? (
        <p className="mt-4 text-sm text-text-secondary">Preparing secure upload…</p>
      ) : null}

      {state.phase === "processing" ? (
        <p className="mt-4 text-sm text-text-secondary">
          Upload complete — scanning and extraction will continue in the background.
        </p>
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
        <Button
          type="submit"
          loading={busy}
          disabled={disabled || (state.phase !== "selected" && !busy)}
        >
          {busy ? "Uploading…" : "Upload"}
        </Button>
        {state.phase === "selected" || state.phase === "error" || state.phase === "success" ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setState({ phase: "idle" })}
          >
            {state.phase === "selected" ? "Clear selection" : "Dismiss"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
