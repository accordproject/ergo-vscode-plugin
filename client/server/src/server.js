'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_languageserver_1 = require("vscode-languageserver");
const glob_1 = require("glob");
const fs = require("fs");
const path = require("path");
const fileUriToPath_1 = require("./fileUriToPath");
const ergo_compiler_1 = require("@accordproject/ergo-compiler");
const composer_concerto_1 = require("composer-concerto");
// Creates the LSP connection
let connection = vscode_languageserver_1.createConnection(vscode_languageserver_1.ProposedFeatures.all);
// Create a manager for open text documents
let documents = new vscode_languageserver_1.TextDocuments();
// Cache the modelManager instances for each document
let templateLogics = {};
// The workspace folder this server is operating on
let workspaceFolder;
documents.onDidOpen((event) => {
    connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Document opened: ${event.document.uri}`);
});
documents.listen(connection);
connection.onInitialize((params) => {
    workspaceFolder = params.rootUri;
    connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Started and initialize received`);
    return {
        capabilities: {
            textDocumentSync: {
                openClose: true,
                change: vscode_languageserver_1.TextDocumentSyncKind.Full
            }
        }
    };
});
// The content of a text document has changed. This event is emitted
// when the text document is first opened or when its content has changed.
documents.onDidChangeContent((change) => __awaiter(this, void 0, void 0, function* () {
    // Revalidate any open text documents
    documents.all().forEach(validateTextDocument);
}));
// This function is not currently triggered by changes to model files, only ergo files
function validateTextDocument(textDocument) {
    return __awaiter(this, void 0, void 0, function* () {
        const pathStr = path.resolve(fileUriToPath_1.default(textDocument.uri));
        const folder = pathStr.substring(0, pathStr.lastIndexOf("/") + 1);
        const parentDir = path.resolve(`${folder}../`);
        let thisTemplateLogic = templateLogics[parentDir];
        if (!thisTemplateLogic) {
            thisTemplateLogic = new ergo_compiler_1.TemplateLogic('cicero');
            templateLogics[parentDir] = thisTemplateLogic;
        }
        const thisModelManager = thisTemplateLogic.getModelManager();
        let diagnostics = [];
        try {
            // Find all cto files in ./ relative to this file or in the parent director
            // if this is a Cicero template.
            let newModels = false;
            const modelFiles = glob_1.glob.sync(`{${folder},${parentDir}/models/}**/*.cto`);
            for (const file of modelFiles) {
                connection.console.log(file);
                const contents = fs.readFileSync(file, 'utf8');
                const modelFile = new composer_concerto_1.ModelFile(thisModelManager, contents, file);
                if (!thisModelManager.getModelFile(modelFile.getNamespace())) {
                    // only add if not existing
                    thisModelManager.addModelFile(contents, file, true);
                    newModels = true;
                }
            }
            // Only pull external models if a new file was added to the model manager
            if (newModels) {
                yield thisModelManager.updateExternalModels();
            }
            try {
                // Find all ergo files in ./ relative to this file
                const ergoFiles = glob_1.glob.sync(`{${folder},${parentDir}/lib/}**/*.ergo`);
                for (const file of ergoFiles) {
                    if (file === pathStr) {
                        // Update the current file being edited
                        thisTemplateLogic.updateLogic(textDocument.getText(), pathStr);
                    }
                    else {
                        connection.console.log(file);
                        const contents = fs.readFileSync(file, 'utf8');
                        thisTemplateLogic.updateLogic(contents, file);
                    }
                }
                const compiled = yield thisTemplateLogic.compileLogic(true);
            }
            catch (error) {
                const descriptor = error.descriptor;
                if (descriptor.kind === 'CompilationError' || descriptor.kind === 'TypeError') {
                    const range = {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 0 },
                    };
                    if (descriptor.locstart.line > 0) {
                        range.start = { line: descriptor.locstart.line - 1, character: descriptor.locstart.character };
                        range.end = range.start;
                    }
                    if (descriptor.locend.line > 0) {
                        range.end = { line: descriptor.locend.line - 1, character: descriptor.locend.character };
                    }
                    diagnostics.push({
                        severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                        range,
                        message: descriptor.message,
                        source: 'ergo'
                    });
                }
                else {
                    diagnostics.push({
                        severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                        range: {
                            start: { line: descriptor.locstart.line - 1, character: descriptor.locstart.character },
                            end: { line: descriptor.locend.line - 1, character: descriptor.locend.character },
                        },
                        message: descriptor.message,
                        source: 'ergo'
                    });
                }
            }
        }
        catch (error) {
            connection.console.error(error.message);
            connection.console.error(error.stack);
        }
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    });
}
connection.listen();
//# sourceMappingURL=server.js.map