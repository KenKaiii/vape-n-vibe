const { notarize } = require("@electron/notarize");
const path = require("path");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== "darwin") {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Notarizing ${appPath}...`);

  await notarize({
    appPath,
    tool: "notarytool",
    appleApiKey: path.resolve(
      process.env.APPLE_API_KEY_PATH ||
        path.join(
          require("os").homedir(),
          ".private_keys",
          "AuthKey_N3Z8QG6Z9Q.p8",
        ),
    ),
    appleApiKeyId: process.env.APPLE_API_KEY_ID || "N3Z8QG6Z9Q",
    appleApiIssuer:
      process.env.APPLE_API_ISSUER || "227af215-d0bc-4bd0-b74c-fff447fa9681",
  });

  console.log("Notarization complete.");
};
