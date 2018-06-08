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
const glob_1 = require("glob");
const fs = require("fs");
// Creates the LSP connection
let connection = vscode_languageserver_1.createConnection(vscode_languageserver_1.ProposedFeatures.all);
// Create a manager for open text documents
let documents = new vscode_languageserver_1.TextDocuments();
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
function validateTextDocument(textDocument) {
    return __awaiter(this, void 0, void 0, function* () {
        let diagnostics = [];
        const folder = textDocument.uri.match(/^file:\/\/(.*\/)(.*)/)[1];
        const modelFilesContents = [];
        const modelFiles = glob_1.glob.sync(folder + "/**/*.cto");
        for (const file of modelFiles) {
            modelFilesContents.push(fs.readFileSync(file, 'utf8'));
        }
        try {
            const compiled = yield Ergo.compile(textDocument.getText(), modelFilesContents, 'javascript_cicero');
            if (compiled.error) {
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
        catch (error) {
            if (error.name === 'SyntaxError') {
                diagnostics.push({
                    severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                    message: error.message,
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 0 },
                    },
                    source: 'cto'
                });
            }
            else {
                connection.console.error(error);
            }
        }
        // Send the computed diagnostics to VS Code.
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    });
}
connection.listen();
//# sourceMappingURL=server.js.map