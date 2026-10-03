export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  /**
   * Where resident-submitted files live when the volume backend is active.
   *
   * `UPLOAD_DIR` wins so a deployment can point somewhere explicit.
   * `RAILWAY_VOLUME_MOUNT_PATH` is injected by Railway when a volume is attached
   * to the service, so a mounted volume is picked up with no extra configuration.
   * The final fallback is a directory beside the process, which is correct on a
   * developer machine and WRONG in a container: that filesystem is discarded on
   * every deploy. See `warnIfStorageIsEphemeral`.
   */
  uploadDir:
    process.env.UPLOAD_DIR ??
    (process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/uploads`
      : ""),
  /** True when the upload directory was configured rather than guessed. */
  uploadDirIsExplicit: Boolean(process.env.UPLOAD_DIR ?? process.env.RAILWAY_VOLUME_MOUNT_PATH),
  /** Present only when an S3-compatible bucket is configured; selects that backend. */
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
};
