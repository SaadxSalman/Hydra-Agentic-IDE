/**
 * Language snippet bank used by the NeuralSim completion nodes.
 * Each entry maps a "trigger" pattern to one or more snippet completions.
 */

export interface Snippet {
  label: string;
  insertText: string;
  trigger: RegExp;
  kind: 'snippet' | 'keyword';
  detail?: string;
}

const PY: Snippet[] = [
  { label: 'def', insertText: 'def ${name}(${args}):\n    ${body}\n', trigger: /def\s*$/, kind: 'keyword' },
  { label: 'class', insertText: 'class ${Name}:\n    def __init__(self, ${args}):\n        self.${attr} = ${attr}\n', trigger: /class\s*$/, kind: 'keyword' },
  { label: 'for', insertText: 'for ${item} in ${items}:\n    ${body}\n', trigger: /for\s*$/, kind: 'keyword' },
  { label: 'while', insertText: 'while ${cond}:\n    ${body}\n', trigger: /while\s*$/, kind: 'keyword' },
  { label: 'if', insertText: 'if ${cond}:\n    ${body}\n', trigger: /if\s*$/, kind: 'keyword' },
  { label: 'try', insertText: 'try:\n    ${body}\nexcept ${Exception} as ${e}:\n    ${handle}\n', trigger: /try\s*$/, kind: 'keyword' },
  { label: 'main', insertText: 'if __name__ == "__main__":\n    ${main}\n', trigger: /if __name__/, kind: 'snippet' },
  { label: 'async def', insertText: 'async def ${name}(${args}):\n    await ${call}\n', trigger: /async def\s*$/, kind: 'keyword' },
  { label: 'import', insertText: 'import ${module}\n', trigger: /import\s*$/, kind: 'keyword' },
  { label: 'from import', insertText: 'from ${module} import ${name}\n', trigger: /from\s*$/, kind: 'keyword' },
  { label: 'with', insertText: 'with ${ctx} as ${var}:\n    ${body}\n', trigger: /with\s*$/, kind: 'keyword' },
  { label: 'pytest', insertText: 'def test_${name}():\n    ${body}\n', trigger: /def test/, kind: 'snippet' },
  { label: 'dataclass', insertText: '@dataclass\nclass ${Name}:\n    ${field}: ${type}\n', trigger: /@dataclass/, kind: 'snippet' },
  { label: 'match', insertText: 'match ${value}:\n    case ${pattern}:\n        ${body}\n', trigger: /match\s*$/, kind: 'keyword' },
];

const TS: Snippet[] = [
  { label: 'fn', insertText: 'function ${name}(${params}): ${Ret} {\n  ${body}\n}', trigger: /function\s*$/, kind: 'keyword' },
  { label: 'arrow', insertText: '(${params}) => ${expr}', trigger: /=>\s*$/, kind: 'keyword' },
  { label: 'class', insertText: 'class ${Name} {\n  constructor(${params}) {\n    ${body}\n  }\n}', trigger: /class\s*$/, kind: 'keyword' },
  { label: 'interface', insertText: 'interface ${Name} {\n  ${prop}: ${type};\n}', trigger: /interface\s*$/, kind: 'keyword' },
  { label: 'type', insertText: 'type ${Name} = {\n  ${prop}: ${type};\n};', trigger: /type\s*$/, kind: 'keyword' },
  { label: 'for', insertText: 'for (let ${i} = 0; ${i} < ${n}; ${i}++) {\n  ${body}\n}', trigger: /for\s*$/, kind: 'keyword' },
  { label: 'forEach', insertText: '${items}.forEach((${item}) => {\n  ${body}\n});', trigger: /\.forEach\s*$/, kind: 'keyword' },
  { label: 'map', insertText: '${items}.map((${item}) => ${transform})', trigger: /\.map\s*$/, kind: 'keyword' },
  { label: 'filter', insertText: '${items}.filter((${item}) => ${cond})', trigger: /\.filter\s*$/, kind: 'keyword' },
  { label: 'try', insertText: 'try {\n  ${body}\n} catch (${err}) {\n  ${handle}\n}', trigger: /try\s*$/, kind: 'keyword' },
  { label: 'async fn', insertText: 'async function ${name}(${params}): Promise<${Ret}> {\n  ${body}\n}', trigger: /async function\s*$/, kind: 'keyword' },
  { label: 'import', insertText: 'import { ${name} } from "${module}";\n', trigger: /import \{/, kind: 'keyword' },
  { label: 'test', insertText: 'describe("${subject}", () => {\n  it("${behaves}", () => {\n    ${body}\n  });\n});', trigger: /describe\s*\(/, kind: 'snippet' },
  { label: 'it', insertText: 'it("${behaves}", () => {\n  ${body}\n});', trigger: /it\s*\(/, kind: 'snippet' },
  { label: 'switch', insertText: 'switch (${value}) {\n  case ${x}:\n    ${body}\n    break;\n  default:\n    ${default}\n}', trigger: /switch\s*\(/, kind: 'keyword' },
];

const RS: Snippet[] = [
  { label: 'fn', insertText: 'fn ${name}(${params}: ${T}) -> ${Ret} {\n    ${body}\n}', trigger: /fn\s*$/, kind: 'keyword' },
  { label: 'struct', insertText: 'struct ${Name} {\n    ${field}: ${T},\n}', trigger: /struct\s*$/, kind: 'keyword' },
  { label: 'impl', insertText: 'impl ${Name} {\n    pub fn ${method}(&self) -> ${Ret} {\n        ${body}\n    }\n}', trigger: /impl\s*$/, kind: 'keyword' },
  { label: 'trait', insertText: 'trait ${Name} {\n    fn ${method}(&self) -> ${Ret};\n}', trigger: /trait\s*$/, kind: 'keyword' },
  { label: 'mod', insertText: 'mod ${name} {\n    ${body}\n}', trigger: /mod\s*$/, kind: 'keyword' },
  { label: 'for', insertText: 'for ${x} in ${iter} {\n    ${body}\n}', trigger: /for\s*$/, kind: 'keyword' },
  { label: 'while', insertText: 'while ${cond} {\n    ${body}\n}', trigger: /while\s*$/, kind: 'keyword' },
  { label: 'match', insertText: 'match ${value} {\n    ${pattern} => ${result},\n    _ => ${default},\n}', trigger: /match\s*$/, kind: 'keyword' },
  { label: 'main', insertText: 'fn main() {\n    ${body}\n}', trigger: /fn main/, kind: 'snippet' },
  { label: 'use', insertText: 'use ${crate}::${item};\n', trigger: /use\s*$/, kind: 'keyword' },
  { label: 'tokio', insertText: 'use tokio::runtime;\n#[tokio::main]\nasync fn main() {\n    ${body}\n}\n', trigger: /tokio/, kind: 'snippet' },
];

const JS_EXTRA: Snippet[] = [
  { label: 'const', insertText: 'const ${name} = ${value};', trigger: /const\s*$/, kind: 'keyword' },
  { label: 'let', insertText: 'let ${name} = ${value};', trigger: /let\s*$/, kind: 'keyword' },
  { label: 'console', insertText: 'console.log(${value});', trigger: /console\.\s*$/, kind: 'keyword' },
  { label: 'export default', insertText: 'export default ${name};', trigger: /export default/, kind: 'keyword' },
  { label: 'require', insertText: 'const ${name} = require("${module}");', trigger: /require\s*\(/, kind: 'keyword' },
];

const GO: Snippet[] = [
  { label: 'fn', insertText: 'func ${name}(${params}) ${Ret} {\n    ${body}\n}', trigger: /func\s*$/, kind: 'keyword' },
  { label: 'for', insertText: 'for (${i} = 0; ${i} < ${n}; ${i}++) {\n    ${body}\n}', trigger: /for\s*$/, kind: 'keyword' },
  { label: 'package', insertText: 'package ${pkg}\n\n', trigger: /package\s*$/, kind: 'keyword' },
  { label: 'main', insertText: 'func main() {\n    ${body}\n}\n', trigger: /func main/, kind: 'snippet' },
];

export const SNIPPET_BANK: Record<string, Snippet[]> = {
  python: PY,
  typescript: TS,
  javascript: JS_EXTRA,
  rust: RS,
  go: GO,
};

/** Ghost-text suffixes for balanced constructs. */
export const GHOST_SUFFIX: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  'if ': ':\n    ',
  'def ': '():\n    ',
  'fn ': '() {\n    \n}',
  'function ': '() {\n  \n}',
};