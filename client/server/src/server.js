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
        const compiled = yield Ergo.compile(textDocument.getText(), [], 'javascript_cicero');
        const regex = /^Parse error \[At line ([0-9]*) column ([0-9]+): ([a-zA-Z0-9\s]+)\]/;
        var match = regex.exec(compiled.error);
        if (match !== null) {
            const line = Number.parseInt(match[1]);
            const column = Number.parseInt(match[2]);
            const message = match[3];
            diagnostics.push({
                severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                range: {
                    start: { line: line - 1, character: column },
                    end: { line: line - 1, character: column }
                },
                message: message,
                source: 'ergo'
            });
        }
        // Send the computed diagnostics to VS Code.
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    });
}
connection.listen();
//# sourceMappingURL=server.js.map