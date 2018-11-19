'use strict';

import {
	createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind,
	Diagnostic, DiagnosticSeverity, TextDocument
} from 'vscode-languageserver';
import * as Ergo from '@accordproject/ergo-compiler/lib/ergo';
import * as CiceroModelManager from '@accordproject/cicero-core/lib/ciceromodelmanager';
import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import { ModelFile } from 'composer-concerto';

// Creates the LSP connection
let connection = createConnection(ProposedFeatures.all);

// Create a manager for open text documents
let documents = new TextDocuments();

// Cache the modelManager instances for each document
let modelManagers = {};

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
documents.onDidChangeContent(async (_) => {
	// Revalidate any open text documents
    documents.all().forEach(validateTextDocument);
});

// This function is not currently triggered by changes to model files, only ergo files
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    if(!modelManagers[textDocument.uri]){
        modelManagers[textDocument.uri] = new CiceroModelManager();
    }
    let diagnostics: Diagnostic[] = [];
    try {
        // Find all cto files in ./ relative to this file or in the parent director
        // if this is a Cicero template.
        const folder = textDocument.uri.match(/^file:\/\/(.*\/)(.*)/)[1];
        const modelFilesContents = [];
        let newModels = false;
        const parentDir = path.resolve(`${folder}../`);
        const modelFiles = glob.sync(`{${folder},${parentDir}/models/}**/*.cto`);
        
        for (const file of modelFiles) {
            const contents = fs.readFileSync(file, 'utf8');
            const modelFile: any = new ModelFile(modelManagers[textDocument.uri], contents, file);
            if (!modelManagers[textDocument.uri].getModelFile(modelFile.getNamespace())) {
                // only add if not existing
                modelManagers[textDocument.uri].addModelFile(contents, file, true);
                newModels = true;
            }
        }

        // Only pull external models if a new file was added to the model manager
        if(newModels){
            await modelManagers[textDocument.uri].updateExternalModels();
        }
        modelManagers[textDocument.uri].getModelFiles().map((f) => {
            modelFilesContents.push({ name: '(CTO Buffer)', content: f.getDefinitions() });
        });

        // Find all ergo files in ./ relative to this file
        const ergoFilesContents = [{ name: '(Ergo Buffer)', content: textDocument.getText() }];
        const ergoFiles = glob.sync(`{${folder},${parentDir}/lib/}**/*.ergo`);
        for (const file of ergoFiles) {
            const contents = fs.readFileSync(file, 'utf8');
            ergoFilesContents.push({ name: file, content: contents });
        }
        
        const compiled = await Ergo.compileToJavaScript(ergoFilesContents, modelManagers[textDocument.uri].getModels(), 'cicero', true);
        if(compiled.error) {
            if(compiled.error.kind === 'CompilationError' || compiled.error.kind === 'TypeError' ){
                const range = {
                    start: { line: 0, character: 0 },
                    end:  { line: 0, character: 0 },
                };
                if(compiled.error.locstart.line > 0) {
                    range.start =  { line: compiled.error.locstart.line-1, character: compiled.error.locstart.character };
                    range.end = range.start;
                }
                if(compiled.error.locend.line > 0) {
                    range.end = { line: compiled.error.locend.line-1, character: compiled.error.locend.character };
                }
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: compiled.error.message,
                    source: 'ergo'
                });
            } else {
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
        }
    } catch (error) {
        connection.console.error(error.message);
        connection.console.error(error.stack);
    }

    // Send the computed diagnostics to VS Code.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.listen();