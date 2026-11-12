import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";

import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import {
  createDocumentUploadBodySchema,
  reviewLineItemBodySchema,
} from "@opero/shared";
import type { Request, Response } from "express";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { OrgMembershipGuard } from "../authorization/org-membership.guard";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import type { AuthenticatedUser } from "../types/express";
import { DocumentsService } from "./documents.service";

@ApiTags("documents")
@Controller("organizations/:organizationId/documents")
@UseGuards(SessionAuthGuard, OrgMembershipGuard, PermissionsGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post("uploads")
  @RequirePermissions("xray:write")
  async createUpload(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(createDocumentUploadBodySchema)) body: unknown,
  ) {
    const input = body as {
      filename: string;
      declaredMimeType?: string;
      declaredFormat?: "PDF" | "XLSX" | "CSV";
      expectedByteSize?: number;
    };
    const upload = await this.documents.createUpload({
      organizationId,
      actor: user,
      ...input,
      requestId: req.requestId,
    });
    return { upload };
  }

  @Post("uploads/:uploadId/complete")
  @RequirePermissions("xray:write")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async completeUpload(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("uploadId") uploadId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException("file is required");
    }
    const result = await this.documents.completeUpload({
      organizationId,
      uploadId,
      actor: user,
      buffer: file.buffer,
      filename: file.originalname,
      declaredMimeType: file.mimetype,
      requestId: req.requestId,
    });
    return result;
  }

  @Get()
  @RequirePermissions("xray:read")
  async list(@Param("organizationId") organizationId: string) {
    const documents = await this.documents.list(organizationId);
    return { documents };
  }

  @Get(":documentId")
  @RequirePermissions("xray:read")
  async get(
    @Param("organizationId") organizationId: string,
    @Param("documentId") documentId: string,
  ) {
    const document = await this.documents.get(organizationId, documentId);
    return { document };
  }

  @Get(":documentId/status")
  @RequirePermissions("xray:read")
  async status(
    @Param("organizationId") organizationId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.documents.status(organizationId, documentId);
  }

  @Get(":documentId/extractions")
  @RequirePermissions("xray:read")
  async extractions(
    @Param("organizationId") organizationId: string,
    @Param("documentId") documentId: string,
  ) {
    const extractions = await this.documents.extractions(organizationId, documentId);
    return { extractions };
  }

  @Post(":documentId/review")
  @RequirePermissions("xray:write")
  async review(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("documentId") documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodBodyPipe(reviewLineItemBodySchema)) body: unknown,
  ) {
    const input = body as {
      lineItemId: string;
      action: "CONFIRM" | "CORRECT" | "REJECT";
      newValue?: string;
      newConcept?: string;
      reason?: string;
    };
    const lineItem = await this.documents.review({
      organizationId,
      documentId,
      actor: user,
      ...input,
      requestId: req.requestId,
    });
    return { lineItem };
  }

  @Delete(":documentId")
  @HttpCode(204)
  @RequirePermissions("xray:write")
  async remove(
    @Req() req: Request,
    @Param("organizationId") organizationId: string,
    @Param("documentId") documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.documents.softDelete({
      organizationId,
      documentId,
      actor: user,
      requestId: req.requestId,
    });
  }

  @Get(":documentId/download")
  @RequirePermissions("xray:read")
  async download(
    @Req() req: Request,
    @Res() res: Response,
    @Param("organizationId") organizationId: string,
    @Param("documentId") documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const file = await this.documents.authorizeDownload({
      organizationId,
      documentId,
      actor: user,
      requestId: req.requestId,
    });
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename.replaceAll('"', "")}"`,
    );
    res.send(file.buffer);
  }
}
