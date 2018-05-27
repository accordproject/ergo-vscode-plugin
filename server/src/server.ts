'use strict';

import {
	createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind,
	Diagnostic, DiagnosticSeverity, TextDocument
} from 'vscode-languageserver';
import * as Ergo from '@accordproject/ergo-compiler/lib/ergo';

// Creates the LSP connection
let connection = createConnection(ProposedFeatures.all);

// Create a manager for open text documents
let documents = new TextDocuments();

// The workspace folder this server is operating on
let workspaceFolder: string;

documents.onDidOpen((event) => {
	connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Document opened: ${event.document.uri}`);
})
documents.listen(connection);

connection.onInitialize((params) => {
	workspaceFolder = params.rootUri;
	connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Started and initialize received`);
	return {
		capabilities: {
			textDocumentSync: {
				openClose: true,
				change: TextDocumentSyncKind.Full
			}
		}
	}
});

// The content of a text document has changed. This event is emitted
// when the text document is first opened or when its content has changed.
documents.onDidChangeContent(async (change) => {
	// Revalidate any open text documents
    documents.all().forEach(validateTextDocument);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	let diagnostics: Diagnostic[] = [];
    const compiled = await Ergo.compile(textDocument.getText(), [], 'javascript_cicero');
    if(compiled.error) {
        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
                start: { line: compiled.error.locstart.line-1, character: compiled.error.locstart.character },
                end:  { line: compiled.error.locend.line-1, character: compiled.error.locend.character },
            },
            message: compiled.error.message,
            source: 'ergo'
        });
    }
    // Send the computed diagnostics to VS Code.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.listen();