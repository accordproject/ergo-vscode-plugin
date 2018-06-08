'use strict';

import {
	createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind,
	Diagnostic, DiagnosticSeverity, TextDocument
} from 'vscode-languageserver';
import * as Ergo from '@accordproject/ergo-compiler/lib/ergo';
import { glob } from 'glob';
import * as fs from "fs";

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
    const folder = textDocument.uri.match(/^file:\/\/(.*\/)(.*)/)[1];
    const modelFilesContents = [];
    const modelFiles = glob.sync(folder+"/**/*.cto");
    for (const file of modelFiles) {
        modelFilesContents.push(fs.readFileSync(file, 'utf8'));
    }
    try {
        const compiled = await Ergo.compile(textDocument.getText(), modelFilesContents, 'javascript_cicero');
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
    } catch (error) {
        if(error.name === 'SyntaxError'){
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                message: error.message,
                range: {
                    start: { line: 0, character: 0 },
                    end:  { line: 0, character: 0 },
                },
                source: 'cto'
            });
        } else {
            connection.console.error(error);
        }

    }

    // Send the computed diagnostics to VS Code.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.listen();