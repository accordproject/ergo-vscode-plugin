'use strict';

import {
	createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind,
	Diagnostic, DiagnosticSeverity, TextDocument
} from 'vscode-languageserver';

import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import fileUriToPath from './fileUriToPath';

import { TemplateLogic } from '@accordproject/ergo-compiler';
import { ModelFile } from 'composer-concerto';

// Creates the LSP connection
let connection = createConnection(ProposedFeatures.all);

// Create a manager for open text documents
let documents = new TextDocuments();

// Cache the modelManager instances for each document
let templateLogics = {};

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

// This function is not currently triggered by changes to model files, only ergo files
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    const pathStr = path.resolve(fileUriToPath(textDocument.uri));
    const folder = pathStr.substring(0,pathStr.lastIndexOf("/")+1);
    const parentDir = path.resolve(`${folder}../`);
    let thisTemplateLogic = templateLogics[parentDir];
    if(!thisTemplateLogic){
        thisTemplateLogic = new TemplateLogic('cicero');
        templateLogics[parentDir] = thisTemplateLogic;
    }
    const thisModelManager = thisTemplateLogic.getModelManager();
    let diagnostics: Diagnostic[] = [];
    try {
        // Find all cto files in ./ relative to this file or in the parent director
        // if this is a Cicero template.
        let newModels = false;
        const modelFiles = glob.sync(`{${folder},${parentDir}/models/}**/*.cto`);

        for (const file of modelFiles) {
            connection.console.log(file);
            const contents = fs.readFileSync(file, 'utf8');
            const modelFile: any = new ModelFile(thisModelManager, contents, file);
            if (!thisModelManager.getModelFile(modelFile.getNamespace())) {
                // only add if not existing
                thisModelManager.addModelFile(contents, file, true);
                newModels = true;
            }
        }

        // Only pull external models if a new file was added to the model manager
        if(newModels){
            await thisModelManager.updateExternalModels();
        }

        try {
            // Find all ergo files in ./ relative to this file
            const ergoFiles = glob.sync(`{${folder},${parentDir}/lib/}**/*.ergo`);
            for (const file of ergoFiles) {
                if (file === pathStr) {
                    // Update the current file being edited
                    thisTemplateLogic.updateLogic(textDocument.getText(), pathStr);
                } else {
                    connection.console.log(file);
                    const contents = fs.readFileSync(file, 'utf8');
                    thisTemplateLogic.updateLogic(contents, file);
                }
            }

            const compiled = await thisTemplateLogic.compileLogic(true);
        } catch (error) {
            const descriptor = error.descriptor;
            if(descriptor.kind === 'CompilationError' || descriptor.kind === 'TypeError' ){
                const range = {
                    start: { line: 0, character: 0 },
                    end:  { line: 0, character: 0 },
                };
                if(descriptor.locstart.line > 0) {
                    range.start =  { line: descriptor.locstart.line-1, character: descriptor.locstart.character };
                    range.end = range.start;
                }
                if(descriptor.locend.line > 0) {
                    range.end = { line: descriptor.locend.line-1, character: descriptor.locend.character };
                }
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: descriptor.message,
                    source: 'ergo'
                });
            } else {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: descriptor.locstart.line-1, character: descriptor.locstart.character },
                        end:  { line: descriptor.locend.line-1, character: descriptor.locend.character },
                    },
                    message: descriptor.message,
                    source: 'ergo'
                });
            }
        }
    } catch (error) {
        connection.console.error(error.message);
        connection.console.error(error.stack);
    }
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.listen();