
from dataclasses import dataclass, asdict
from typing import List, Optional
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
import tree_sitter_typescript as tstypescript
from tree_sitter import Language, Parser

@dataclass
class CodeSymbol:
    name: str
    kind: str  # function, class, method, variable
    file_path: str
    start_line: int
    end_line: int
    signature: str
    docstring: Optional[str]
    body: str
    language: str

    def to_dict(self):
        return asdict(self)


class MultiLanguageParser:
    """Parser supporting multiple programming languages via Tree-sitter"""

    SUPPORTED_EXTENSIONS = {
        '.py': 'python',
        '.js': 'javascript',
        '.jsx': 'jsx',
        '.ts': 'typescript',
        '.tsx': 'tsx',
        '.go': 'go',
    }

    def __init__(self):
        self.parsers = {}
        self._init_parsers()

    def _init_parsers(self):
        """Initialize Tree-sitter parsers for each language"""
        try:
            # Python parser
            py_lang = Language(tspython.language(), 'python')
            py_parser = Parser()
            py_parser.set_language(py_lang)
            self.parsers['python'] = py_parser

            # JavaScript parser
            js_lang = Language(tsjavascript.language(), 'javascript')
            js_parser = Parser()
            js_parser.set_language(js_lang)
            self.parsers['javascript'] = js_parser
            self.parsers['jsx'] = js_parser  # JSX uses JS parser

            # TypeScript parser (proper TS support)
            ts_ptr = tstypescript.language_typescript()
            ts_lang = Language(ts_ptr, 'typescript')
            ts_parser = Parser()
            ts_parser.set_language(ts_lang)
            self.parsers['typescript'] = ts_parser

            # TSX parser (TypeScript with JSX)
            tsx_ptr = tstypescript.language_tsx()
            tsx_lang = Language(tsx_ptr, 'tsx')
            tsx_parser = Parser()
            tsx_parser.set_language(tsx_lang)
            self.parsers['tsx'] = tsx_parser

            print(f"✅ Initialized parsers: {list(self.parsers.keys())}")

        except Exception as e:
            print(f"Warning: Failed to initialize some parsers: {e}")

    def is_supported(self, file_path: str) -> bool:
        """Check if file type is supported"""
        for ext in self.SUPPORTED_EXTENSIONS:
            if file_path.endswith(ext):
                return True
        return False

    def detect_language(self, file_path: str) -> Optional[str]:
        """Detect language from file extension"""
        for ext, lang in self.SUPPORTED_EXTENSIONS.items():
            if file_path.endswith(ext):
                return lang
        return None

    def parse_file(self, content: str, file_path: str) -> List[CodeSymbol]:
        """Parse a file and extract code symbols"""
        language = self.detect_language(file_path)
        if not language or language not in self.parsers:
            return []

        parser = self.parsers[language]
        try:
            tree = parser.parse(bytes(content, 'utf8'))
            if not tree or not tree.root_node:
                print(f"  ❌ Failed to get root node for {file_path}")
                return []
                
            symbols = []
            self._extract_symbols(tree.root_node, content, file_path, language, symbols)
            if len(symbols) > 0:
                print(f"  ✅ Parsed {file_path}: found {len(symbols)} symbols")
            return symbols
        except Exception as e:
            import traceback
            print(f"  ❌ Error parsing {file_path}: {e}")
            traceback.print_exc()
            return []

    def _extract_symbols(
        self,
        node,
        content: str,
        file_path: str,
        language: str,
        symbols: List[CodeSymbol],
    ):
        """Recursively extract symbols from AST"""
        if node is None:
            return
        
        # Python function definitions
        if node.type == 'function_definition':
            symbol = self._extract_python_function(node, content, file_path, language)
            if symbol:
                symbols.append(symbol)

        # Python class definitions
        elif node.type == 'class_definition':
            symbol = self._extract_python_class(node, content, file_path, language)
            if symbol:
                symbols.append(symbol)

        # JavaScript/TypeScript function declarations
        elif node.type in ('function_declaration', 'method_definition'):
            symbol = self._extract_js_function(node, content, file_path, language)
            if symbol:
                symbols.append(symbol)

        # JavaScript arrow functions with variable declaration
        elif node.type in ('lexical_declaration', 'variable_declaration'):
            self._extract_js_variable_functions(node, content, file_path, language, symbols)

        # JavaScript class declarations
        elif node.type == 'class_declaration':
            symbol = self._extract_js_class(node, content, file_path, language)
            if symbol:
                symbols.append(symbol)

        # Recurse into children
        for child in node.children:
            self._extract_symbols(child, content, file_path, language, symbols)

    def _extract_python_function(
        self, node, content: str, file_path: str, language: str
    ) -> Optional[CodeSymbol]:
        """Extract Python function definition"""
        name_node = node.child_by_field_name('name')
        params_node = node.child_by_field_name('parameters')
        body_node = node.child_by_field_name('body')

        if not name_node:
            return None

        name = content[name_node.start_byte:name_node.end_byte]
        params = content[params_node.start_byte:params_node.end_byte] if params_node else '()'
        
        # Extract body (truncate for embedding)
        body = ""
        if body_node:
            body = content[body_node.start_byte:body_node.end_byte][:1000]

        # Extract docstring
        docstring = self._extract_python_docstring(body_node, content)

        return CodeSymbol(
            name=name,
            kind='function',
            file_path=file_path,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            signature=f"def {name}{params}",
            docstring=docstring,
            body=body,
            language=language,
        )

    def _extract_python_class(
        self, node, content: str, file_path: str, language: str
    ) -> Optional[CodeSymbol]:
        """Extract Python class definition"""
        name_node = node.child_by_field_name('name')
        body_node = node.child_by_field_name('body')

        if not name_node:
            return None

        name = content[name_node.start_byte:name_node.end_byte]
        
        # Get class body (truncated)
        body = content[node.start_byte:node.end_byte][:1000]
        docstring = self._extract_python_docstring(body_node, content)

        return CodeSymbol(
            name=name,
            kind='class',
            file_path=file_path,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            signature=f"class {name}",
            docstring=docstring,
            body=body,
            language=language,
        )

    def _extract_python_docstring(self, body_node, content: str) -> Optional[str]:
        """Extract docstring from function/class body"""
        if not body_node or body_node.child_count == 0:
            return None

        first_child = body_node.children[0]
        if first_child.type == 'expression_statement':
            string_node = first_child.children[0] if first_child.child_count > 0 else None
            if string_node and string_node.type == 'string':
                docstring = content[string_node.start_byte:string_node.end_byte]
                return docstring.strip('"""').strip("'''").strip()
        return None

    def _extract_js_function(
        self, node, content: str, file_path: str, language: str
    ) -> Optional[CodeSymbol]:
        """Extract JavaScript function"""
        name_node = node.child_by_field_name('name')
        if not name_node:
            return None

        name = content[name_node.start_byte:name_node.end_byte]
        signature = content[node.start_byte:node.start_byte + 100].split('{')[0].strip()
        body = content[node.start_byte:node.end_byte][:1000]

        return CodeSymbol(
            name=name,
            kind='function',
            file_path=file_path,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            signature=signature,
            docstring=None,
            body=body,
            language=language,
        )

    def _extract_js_variable_functions(
        self, node, content: str, file_path: str, language: str, symbols: List[CodeSymbol]
    ):
        """Extract functions assigned to variables (const x = () => ...)"""
        for child in node.children:
            if child.type == 'variable_declarator':
                name_node = child.child_by_field_name('name')
                value_node = child.child_by_field_name('value')
                
                if name_node and value_node and value_node.type in ('arrow_function', 'function_expression'):
                    name = content[name_node.start_byte:name_node.end_byte]
                    
                    # Capture signature (first 100 chars or until start of body)
                    sig_end = value_node.start_byte + 100
                    sig_text = content[value_node.start_byte:sig_end].split('{')[0].strip()
                    signature = f"const {name} = {sig_text}"
                    
                    body = content[value_node.start_byte:value_node.end_byte][:1000]

                    symbols.append(CodeSymbol(
                        name=name,
                        kind='function',
                        file_path=file_path,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        signature=signature,
                        docstring=None,
                        body=body,
                        language=language,
                    ))

    def _extract_js_class(
        self, node, content: str, file_path: str, language: str
    ) -> Optional[CodeSymbol]:
        """Extract JavaScript class"""
        name_node = node.child_by_field_name('name')
        if not name_node:
            return None

        name = content[name_node.start_byte:name_node.end_byte]
        body = content[node.start_byte:node.end_byte][:1000]

        return CodeSymbol(
            name=name,
            kind='class',
            file_path=file_path,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            signature=f"class {name}",
            docstring=None,
            body=body,
            language=language,
        )