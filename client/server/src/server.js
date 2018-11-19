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
const Ergo = require("@accordproject/ergo-compiler/lib/ergo");
const CiceroModelManager = require("@accordproject/cicero-core/lib/ciceromodelmanager");
const glob_1 = require("glob");
const fs = require("fs");
const path = require("path");
const composer_concerto_1 = require("composer-concerto");
// Creates the LSP connection
let connection = vscode_languageserver_1.createConnection(vscode_languageserver_1.ProposedFeatures.all);
// Create a manager for open text documents
let documents = new vscode_languageserver_1.TextDocuments();
// Cache the modelManager instances for each document
let modelManagers = {};
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
documents.onDidChangeContent((_) => __awaiter(this, void 0, void 0, function* () {
    // Revalidate any open text documents
    documents.all().forEach(validateTextDocument);
}));
// This function is not currently triggered by changes to model files, only ergo files
function validateTextDocument(textDocument) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!modelManagers[textDocument.uri]) {
            modelManagers[textDocument.uri] = new CiceroModelManager();
        }
        let diagnostics = [];
        try {
            // Find all cto files in ./ relative to this file or in the parent director
            // if this is a Cicero template.
            const folder = textDocument.uri.match(/^file:\/\/(.*\/)(.*)/)[1];
            const modelFilesContents = [];
            let newModels = false;
            const parentDir = path.resolve(`${folder}../`);
            const modelFiles = glob_1.glob.sync(`{${folder},${parentDir}/models/}**/*.cto`);
            for (const file of modelFiles) {
                const contents = fs.readFileSync(file, 'utf8');
                const modelFile = new composer_concerto_1.ModelFile(modelManagers[textDocument.uri], contents, file);
                if (!modelManagers[textDocument.uri].getModelFile(modelFile.getNamespace())) {
                    // only add if not existing
                    modelManagers[textDocument.uri].addModelFile(contents, file, true);
                    newModels = true;
                }
            }
            // Only pull external models if a new file was added to the model manager
            if (newModels) {
                yield modelManagers[textDocument.uri].updateExternalModels();
            }
            modelManagers[textDocument.uri].getModelFiles().map((f) => {
                modelFilesContents.push({ name: '(CTO Buffer)', content: f.getDefinitions() });
            });
            // Find all ergo files in ./ relative to this file
            const ergoFilesContents = [{ name: '(Ergo Buffer)', content: textDocument.getText() }];
            const ergoFiles = glob_1.glob.sync(`{${folder},${parentDir}/lib/}**/*.ergo`);
            for (const file of ergoFiles) {
                const contents = fs.readFileSync(file, 'utf8');
                ergoFilesContents.push({ name: file, content: contents });
            }
            const compiled = yield Ergo.compileToJavaScript(ergoFilesContents, modelManagers[textDocument.uri].getModels(), 'cicero', true);
            if (compiled.error) {
                if (compiled.error.kind === 'CompilationError' || compiled.error.kind === 'TypeError') {
                    const range = {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 0 },
                    };
                    if (compiled.error.locstart.line > 0) {
                        range.start = { line: compiled.error.locstart.line - 1, character: compiled.error.locstart.character };
                        range.end = range.start;
                    }
                    if (compiled.error.locend.line > 0) {
                        range.end = { line: compiled.error.locend.line - 1, character: compiled.error.locend.character };
                    }
                    diagnostics.push({
                        severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                        range,
                        message: compiled.error.message,
                        source: 'ergo'
                    });
                }
                else {
                    diagnostics.push({
                        severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                        range: {
                            start: { line: compiled.error.locstart.line - 1, character: compiled.error.locstart.character },
                            end: { line: compiled.error.locend.line - 1, character: compiled.error.locend.character },
                        },
                        message: compiled.error.message,
                        source: 'ergo'
                    });
                }
            }
        }
        catch (error) {
            connection.console.error(error.message);
            connection.console.error(error.stack);
        }
        // Send the computed diagnostics to VS Code.
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    });
}
connection.listen();
//# sourceMappingURL=server.js.map