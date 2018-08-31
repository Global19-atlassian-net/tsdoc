import * as colors from 'colors';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import * as tsdoc from '@microsoft/tsdoc';

/**
 * The advanced demo uses the TypeScript compiler API to locate the comment text.
 * It also illustrates how to define custom TSDoc tags using TSDocParserConfiguration.
 */
export function advancedDemo(): void {
  console.log(colors.yellow('Demo scenario: advanced') + os.EOL);

  const inputFilename: string = path.resolve(path.join(__dirname, '..', 'assets', 'advanced-input.ts'));
  const compilerOptions: ts.CompilerOptions = {
    'target': ts.ScriptTarget.ES5
  };

  // Compile the input
  console.log('Reading assets/advanced-input.ts...');

  const program: ts.Program = ts.createProgram([ inputFilename ], compilerOptions);

  // Report any compiler errors
  for (const diagnostic of program.getSemanticDiagnostics()) {
    const message: string = ts.flattenDiagnosticMessageText(diagnostic.messageText, os.EOL);
    if (diagnostic.file) {
      const location: ts.LineAndCharacter = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
      const formattedMessage: string = `${diagnostic.file.fileName}(${location.line + 1},${location.character + 1}):`
        + ` [TypeScript] ${message}`;
      console.log(colors.red(formattedMessage));
    } else {
      console.log(colors.red(message));
    }
  }

  // Find the first code comment
  const sourceFile: ts.SourceFile | undefined = program.getSourceFile(inputFilename);
  if (!sourceFile) {
    throw new Error('Error retrieving source file');
  }

  console.log(os.EOL + colors.green('Scanning compiler AST for first code comment...') + os.EOL);

  const visitorContext: IVisitorContext = {
    commentNode: undefined,
    commentText: undefined
  };

  visitCompilerAst(sourceFile, '', visitorContext);

  if (!visitorContext.commentText) {
    console.log(colors.red('Error: No code comments were found in the input file'));
  } else {
    parseTSDoc(visitorContext.commentText, visitorContext.commentNode!);
  }
}

interface IVisitorContext {
  commentNode: ts.Node | undefined;
  commentText: tsdoc.TextRange | undefined;
}

function visitCompilerAst(node: ts.Node, indent: string, visitorContext: IVisitorContext): void {
  console.log(`${indent}- ${ts.SyntaxKind[node.kind]}`);

  if (!visitorContext.commentNode) {
    // Obtain the comments for this node
    const buffer: string = node.getSourceFile().getText();
    const comments: ts.CommentRange[] = [];
    comments.push(...ts.getLeadingCommentRanges(buffer, node.getFullStart()) || []);
    comments.push(...ts.getTrailingCommentRanges(buffer, node.getFullStart()) || []);

    if (comments.length > 0) {
      console.log(indent + colors.yellow('  FOUND COMMENT'));
      const comment: ts.CommentRange = comments[0];
      visitorContext.commentNode = node;
      visitorContext.commentText = tsdoc.TextRange.fromStringRange(buffer, comment.pos, comment.end);
    }
  }

  return node.forEachChild(child => visitCompilerAst(child, indent + '  ', visitorContext));
}

function parseTSDoc(textRange: tsdoc.TextRange, commentNode: ts.Node): void {
  console.log(os.EOL + colors.green('Input Buffer:') + os.EOL);
  console.log(colors.gray('<<<<<<'));
  console.log(textRange.toString());
  console.log(colors.gray('>>>>>>'));

  const customConfiguration: tsdoc.TSDocParserConfiguration = new tsdoc.TSDocParserConfiguration();

  const customInlineDefinition: tsdoc.TSDocTagDefinition = new tsdoc.TSDocTagDefinition({
    tagName: '@customInline',
    syntaxKind: tsdoc.TSDocTagSyntaxKind.InlineTag,
    allowMultiple: true
  });

  // NOTE: Defining this causes a new DocBlock to be created under docComment.customBlocks.
  // Otherwise, a simple DocBlockTag would appear inline in the @remarks section.
  const customBlockDefinition: tsdoc.TSDocTagDefinition = new tsdoc.TSDocTagDefinition({
    tagName: '@customBlock',
    syntaxKind: tsdoc.TSDocTagSyntaxKind.BlockTag
  });

  // NOTE: Defining this causes @customModifier to be removed from its section,
  // and added to the docComment.modifierTagSet
  const customModifierDefinition: tsdoc.TSDocTagDefinition = new tsdoc.TSDocTagDefinition({
    tagName: '@customModifier',
    syntaxKind: tsdoc.TSDocTagSyntaxKind.ModifierTag
  });

  customConfiguration.addTagDefinitions([
    customInlineDefinition,
    customBlockDefinition,
    customModifierDefinition
  ]);

  console.log(os.EOL + 'Invoking TSDocParser with custom configuration...' + os.EOL);
  const tsdocParser: tsdoc.TSDocParser = new tsdoc.TSDocParser(customConfiguration);
  const parserContext: tsdoc.ParserContext = tsdocParser.parseRange(textRange);
  const docComment: tsdoc.DocComment = parserContext.docComment;

  console.log(os.EOL + colors.green('Parser Log Messages:') + os.EOL);

  if (parserContext.log.messages.length === 0) {
    console.log('No errors or warnings.');
  } else {
    const sourceFile: ts.SourceFile = commentNode.getSourceFile();
    for (const message of parserContext.log.messages) {
      // Since we have the compiler's analysis, use it to calculate the line/column information,
      // since this is currently faster than TSDoc's TextRange.getLocation() lookup.
      const location: ts.LineAndCharacter = sourceFile.getLineAndCharacterOfPosition(message.textRange.pos);
      const formattedMessage: string = `${sourceFile.fileName}(${location.line + 1},${location.character + 1}):`
        + ` [TSDoc] ${message}`;
      console.log(formattedMessage);
    }
  }

  if (parserContext.docComment.modifierTagSet.hasTag(customModifierDefinition)) {
    console.log(os.EOL + `The ${customModifierDefinition.tagName} modifier was FOUND.`);
  } else {
    console.log(os.EOL + `The ${customModifierDefinition.tagName} modifier was NOT FOUND.`);
  }

  console.log(os.EOL + colors.green('Visiting TSDoc\'s DocNode tree') + os.EOL);
  dumpTSDocTree(docComment, '');
}

function dumpTSDocTree(docNode: tsdoc.DocNode, indent: string): void {
  let dumpText: string = `${indent}- ${docNode.kind}`;
  if (docNode.excerpt) {
    const content: string = docNode.excerpt.content.toString();
    if (content.length > 0) {
      dumpText += ': ' + colors.cyan(JSON.stringify(content));
    }
  }
  console.log(dumpText);

  for (const child of docNode.getChildNodes()) {
    dumpTSDocTree(child, indent + '  ');
  }
}
