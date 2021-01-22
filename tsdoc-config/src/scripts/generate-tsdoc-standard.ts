import * as path from 'path';
import * as fs from 'fs';
import wordWrap from 'word-wrap';
import { DocExcerpt, DocNode, DocNodeKind, DocSection, StandardTags, TSDocTagSyntaxKind } from '@microsoft/tsdoc';
import { ApiClass, ApiItem, ApiDocumentedItem, ApiPackage } from '@microsoft/api-extractor-model';

import { TSDocConfigFile } from '..';

try {
  const apiJsonFilePath: string = path.join(__dirname, '../../../tsdoc/temp/tsdoc.api.json');

  console.log(`Reading ${apiJsonFilePath}`);
  const tsdocApiPackage: ApiPackage = ApiPackage.loadFromJsonFile(apiJsonFilePath);
  const tagsApiClass: ApiItem | undefined = tsdocApiPackage.entryPoints[0].findMembersByName('StandardTags')[0];
  if (!(tagsApiClass instanceof ApiClass)) {
    throw new Error('Unable to find StandardTags API');
  }

  const outputLines: string[] = [];

  outputLines.push(
    ...[
      `// This file defines the standard TSDoc tags.  Your tsdoc.json config file`,
      `// `,
      `// (THIS IS A MACHINE-GENERATED FILE.  To make a change, edit the StandardTags.ts source file.)`,
      `{`,
      `  "$schema": "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",`,
      ``,
      `  "tagDefinitions": [`,
    ]
  );

  function extractExcerpts(node: DocNode): string {
    if (node.kind === DocNodeKind.Excerpt) {
      return (node as DocExcerpt).content.toString();
    } else {
      let result: string = '';
      for (const child of node.getChildNodes()) {
        result += extractExcerpts(child);
      }
      return result;
    }
  }

  let firstItem: boolean = true;

  for (const definition of StandardTags.allDefinitions) {
    if (firstItem) {
      firstItem = false;
    } else {
      // If it's not the first definition in the list, then append a comma and newline
      outputLines[outputLines.length - 1] += ',';
      outputLines.push('');
    }

    const member: ApiItem | undefined = tagsApiClass.findMembersByName(definition.tagName.substring(1))[0];
    if (!(member instanceof ApiDocumentedItem)) {
      throw new Error(`Unable to find definition for ${definition.tagName}`);
    }

    const summarySection: DocSection | undefined = member.tsdocComment?.summarySection;
    if (summarySection) {
      const summary: string = wordWrap(extractExcerpts(summarySection), { width: 80, indent: '' });

      outputLines.push(...summary.split('\n').map((x) => '    // ' + x));
    }

    let syntaxKind: string = '??';
    switch (definition.syntaxKind) {
      case TSDocTagSyntaxKind.BlockTag:
        syntaxKind = 'block';
        break;
      case TSDocTagSyntaxKind.ModifierTag:
        syntaxKind = 'modifier';
        break;
      case TSDocTagSyntaxKind.InlineTag:
        syntaxKind = 'inline';
        break;
    }

    outputLines.push(
      // prettier-ignore
      ...[
      `    {`,
      `      "tagName": "${definition.tagName}",`,
      `      "syntaxKind": "${syntaxKind}"`,
      `    }`,
    ]
    );
  }

  outputLines.push(
    // prettier-ignore
    ...[
    `  ],`,
    ``,
    `  // Note: Adding at least one entry to this list enables warnings for unsupported tags`,
    `  "supportForTags": { }`,
    `}`
  ]
  );

  const outputContent: string = outputLines.join('\n');

  const targetFilePath: string = path.join(__dirname, '../../../tsdoc/includes/tsdoc-standard.json');

  console.log();
  console.log(`==> Checking target file: ${targetFilePath}`);
  const previousContent: string = fs.readFileSync(targetFilePath).toString().split('\r').join('');

  if (outputContent.trim() === previousContent.trim()) {
    console.log('==> Target file is up to date.');
  } else {
    console.log('==> WARNING: The target file has been regenerated.  Ensure this change is committed to Git.');
    fs.writeFileSync(targetFilePath, outputContent);

    // Validate that we can load the file we just wrote
    try {
      const result: TSDocConfigFile = TSDocConfigFile.loadFile(targetFilePath);
      if (result.hasErrors) {
        throw new Error('The generated target file is invalid: ' + result.getErrorSummary());
      }
    } catch (error) {
      throw new Error('The generated target file cannot be parsed: ' + error.toString());
    }

    process.exitCode = 1;
  }
  console.log();
} catch (error) {
  console.error();
  console.error('ERROR: ' + error.message);
  process.exitCode = 2;
}
