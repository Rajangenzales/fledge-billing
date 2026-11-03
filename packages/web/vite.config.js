import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const browserContractEntry = resolve(packageRoot, "src/browser-contract.js");
const releaseManifest = JSON.parse(
  readFileSync(resolve(packageRoot, "src/release-manifest.json"), "utf8"),
);

const forbiddenNodeImport =
  /^(?:node:[^/]+|assert|buffer|child_process|cluster|console|constants|crypto|dgram|diagnostics_channel|dns|domain|events|fs|http|https|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|wasi|worker_threads|zlib)(?:\/.*)?$/;

const requiredBrowserExports = [
  "getBusinessProfile",
  "saveBusinessProfile",
  "listCustomers",
  "getCustomer",
  "createCustomer",
  "updateCustomer",
  "createProduct",
  "createSavedGstRate",
  "getProduct",
  "listProducts",
  "listSavedGstRates",
  "listTaxCategories",
  "updateProduct",
  "updateSavedGstRate",
  "cancelDocument",
  "createDocument",
  "finalizeDocument",
  "getDocument",
  "listDocuments",
  "saveNumberSeries",
  "updateDocument",
  "getTemplate",
  "listTemplates",
  "reviseTemplate",
  "setDefaultTemplate",
  "previewTemplate",
  "renderIssuedDocument",
  "buildInvoicePdf",
  "restoreTemplate",
  "recordCustomerReceipt",
  "listCustomerReceipts",
  "getCustomerAdvance",
  "allocateReceiptToInvoice",
  "releaseReceiptAllocation",
  "getInvoiceSettlement",
  "getCustomerAllocatedTotal",
  "recordCustomerRefund",
  "reverseCustomerReceipt",
  "reverseCustomerRefund",
  "listReceiptAdjustments",
  "getCustomerPaymentActivity",
  "renderCustomerReceipt",
  "customerReceiptPrintLines",
];

function browserDependencyGuard() {
  return {
    name: "fledge-browser-dependency-guard",
    generateBundle(_options, bundle) {
      const violations = [];
      let browserContractFound = false;
      let browserContractFileName;

      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== "chunk") continue;

        if (
          output.facadeModuleId?.replaceAll("\\", "/").endsWith("/src/browser-contract.js")
        ) {
          browserContractFound = true;
          browserContractFileName = fileName;
          for (const exportName of requiredBrowserExports) {
            if (!output.exports.includes(exportName)) {
              violations.push(
                fileName + ": browser contract is missing export \"" + exportName + "\"",
              );
            }
          }
        }

        for (const importedId of [...output.imports, ...output.dynamicImports]) {
          if (forbiddenNodeImport.test(importedId)) {
            violations.push(fileName + ": forbidden Node.js dependency \"" + importedId + "\"");
          }
        }

        if (/\bprocess\.env\b|\b__dirname\b|\b__filename\b/.test(output.code)) {
          violations.push(fileName + ": Node.js runtime global found in browser output");
        }
      }

      if (!browserContractFound) {
        violations.push("The retained browser application contract entry was not emitted.");
      }

      if (violations.length > 0) {
        this.error("Fledge browser dependency guard failed:\n- " + violations.join("\n- "));
      }
      if (browserContractFileName) {
        delete bundle[browserContractFileName];
      }
    },
  };
}

function versionedServiceWorker() {
  return {
    name: "fledge-versioned-service-worker",
    writeBundle(outputOptions) {
      const outputDirectory = outputOptions.dir ?? resolve(packageRoot, "dist");
      const assetsDirectory = resolve(outputDirectory, "assets");
      const assetFiles = readdirSync(assetsDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.(?:css|js)$/.test(entry.name))
        .map((entry) => "assets/" + entry.name);
      const artifactFiles = ["index.html", ...assetFiles].sort();
      const buildFingerprint = createHash("sha256");
      for (const fileName of artifactFiles) {
        buildFingerprint.update(fileName);
        buildFingerprint.update(readFileSync(resolve(outputDirectory, fileName)));
      }
      const buildVersion = releaseManifest.version + "-" + buildFingerprint.digest("hex").slice(0, 16);
      const workerSource = readFileSync(resolve(packageRoot, "public/sw.js"), "utf8");
      const versionedWorker = workerSource.replace(
        '"__FLEDGE_BUILD_VERSION__"',
        JSON.stringify(buildVersion),
      );
      if (versionedWorker === workerSource) {
        this.error("The service-worker build version placeholder was not found.");
      }
      writeFileSync(resolve(outputDirectory, "sw.js"), versionedWorker);
      const release = structuredClone(releaseManifest);
      release.integrity.sha256 = createHash("sha256").update(versionedWorker).digest("hex");
      release.integrity.artifacts = artifactFiles.map((fileName) => ({
        url: "/" + fileName,
        sha256: createHash("sha256").update(readFileSync(resolve(outputDirectory, fileName))).digest("hex"),
      }));
      writeFileSync(
        resolve(outputDirectory, "release-manifest.json"),
        JSON.stringify(release, null, 2) + "\n",
      );
    },
  };
}

export default defineConfig({
  plugins: [browserDependencyGuard(), versionedServiceWorker()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      preserveEntrySignatures: "strict",
      input: {
        index: resolve(packageRoot, "index.html"),
        browserContract: browserContractEntry,
      },
    },
  },
});
