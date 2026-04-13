// Formula Parser - Converts formula strings into executable expressions
// Supports: +, -, *, /, %, (), {Column References}, comparisons, and functions

export type FormulaNode = 
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'column'; columnId: string }
  | { type: 'operator'; op: '+' | '-' | '*' | '/' | '%'; left: FormulaNode; right: FormulaNode }
  | { type: 'comparison'; op: '>' | '<' | '>=' | '<=' | '==' | '!='; left: FormulaNode; right: FormulaNode }
  | { type: 'function'; name: string; args: FormulaNode[] }
  | { type: 'error'; message: string };

export class FormulaParser {
  private pos = 0;
  private text = '';

  parse(formula: string): FormulaNode {
    this.text = formula.trim();
    this.pos = 0;
    
    try {
      const result = this.parseExpression();
      // Make sure we consumed the entire input
      this.skipWhitespace();
      if (this.pos < this.text.length) {
        throw new Error(`Unexpected characters at position ${this.pos}: ${this.text.substring(this.pos)}`);
      }
      return result;
    } catch (error) {
      return {
        type: 'error',
        message: error instanceof Error ? error.message : 'Parse error',
      };
    }
  }

  private parseExpression(): FormulaNode {
    return this.parseComparison();
  }

  private parseComparison(): FormulaNode {
    let left = this.parseAdditive();

    this.skipWhitespace();
    const char = this.peek();
    const nextChar = this.peekNext();

    // Check for comparison operators
    if (char === '>' && nextChar === '=') {
      this.consume();
      this.consume();
      const right = this.parseAdditive();
      return { type: 'comparison', op: '>=', left, right };
    } else if (char === '<' && nextChar === '=') {
      this.consume();
      this.consume();
      const right = this.parseAdditive();
      return { type: 'comparison', op: '<=', left, right };
    } else if (char === '=' && nextChar === '=') {
      this.consume();
      this.consume();
      const right = this.parseAdditive();
      return { type: 'comparison', op: '==', left, right };
    } else if (char === '!' && nextChar === '=') {
      this.consume();
      this.consume();
      const right = this.parseAdditive();
      return { type: 'comparison', op: '!=', left, right };
    } else if (char === '>') {
      this.consume();
      const right = this.parseAdditive();
      return { type: 'comparison', op: '>', left, right };
    } else if (char === '<') {
      this.consume();
      const right = this.parseAdditive();
      return { type: 'comparison', op: '<', left, right };
    }

    return left;
  }

  private parseAdditive(): FormulaNode {
    let left = this.parseMultiplicative();

    this.skipWhitespace();
    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.consume() as '+' | '-';
      this.skipWhitespace();
      const right = this.parseMultiplicative();
      left = { type: 'operator', op, left, right };
      this.skipWhitespace();
    }

    return left;
  }

  private parseMultiplicative(): FormulaNode {
    let left = this.parseUnary();

    this.skipWhitespace();
    while (this.peek() === '*' || this.peek() === '/' || this.peek() === '%') {
      const op = this.consume() as '*' | '/' | '%';
      this.skipWhitespace();
      const right = this.parseUnary();
      left = { type: 'operator', op, left, right };
      this.skipWhitespace();
    }

    return left;
  }

  private parseUnary(): FormulaNode {
    this.skipWhitespace();
    
    // Handle negative numbers
    if (this.peek() === '-') {
      this.consume();
      const node = this.parseUnary();
      return { 
        type: 'operator', 
        op: '-', 
        left: { type: 'number', value: 0 }, 
        right: node 
      };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): FormulaNode {
    this.skipWhitespace();

    // Handle parentheses
    if (this.peek() === '(') {
      this.consume();
      const node = this.parseExpression();
      this.skipWhitespace();
      this.expect(')');
      return node;
    }

    // Handle column references: {Column Name}
    if (this.peek() === '{') {
      return this.parseColumnReference();
    }

    // Handle functions: SUM(...), AVG(...), etc.
    if (this.isLetter(this.peek())) {
      return this.parseFunction();
    }

    // Handle numbers
    if (this.isDigit(this.peek()) || this.peek() === '.') {
      return this.parseNumber();
    }

    // Handle strings (quoted)
    if (this.peek() === '"' || this.peek() === "'") {
      return this.parseString();
    }

    throw new Error(`Unexpected character: ${this.peek()} at position ${this.pos}`);
  }

  private parseColumnReference(): FormulaNode {
    this.expect('{');
    let columnName = '';
    
    while (this.pos < this.text.length && this.peek() !== '}') {
      columnName += this.consume();
    }
    
    this.expect('}');
    
    // Return as column reference (will be resolved later)
    return { type: 'column', columnId: columnName.trim() };
  }

  private parseFunction(): FormulaNode {
    let name = '';
    
    while (this.isLetter(this.peek()) || this.isDigit(this.peek())) {
      name += this.consume();
    }
    
    this.skipWhitespace();
    this.expect('(');
    
    const args: FormulaNode[] = [];
    
    this.skipWhitespace();
    if (this.peek() !== ')') {
      args.push(this.parseExpression());
      
      this.skipWhitespace();
      while (this.peek() === ',') {
        this.consume();
        this.skipWhitespace();
        args.push(this.parseExpression());
        this.skipWhitespace();
      }
    }
    
    this.expect(')');
    
    return { type: 'function', name: name.toUpperCase(), args };
  }

  private parseNumber(): FormulaNode {
    let num = '';
    
    while (this.isDigit(this.peek()) || this.peek() === '.') {
      num += this.consume();
    }
    
    return { type: 'number', value: parseFloat(num) };
  }

  private parseString(): FormulaNode {
    const quote = this.consume(); // ' or "
    let str = '';
    
    while (this.pos < this.text.length && this.peek() !== quote) {
      str += this.consume();
    }
    
    this.expect(quote);
    
    return { type: 'string', value: str };
  }

  private peek(): string {
    return this.pos < this.text.length ? this.text[this.pos] : '';
  }

  private peekNext(): string {
    return this.pos + 1 < this.text.length ? this.text[this.pos + 1] : '';
  }

  private consume(): string {
    return this.text[this.pos++];
  }

  private expect(char: string) {
    this.skipWhitespace();
    if (this.peek() !== char) {
      throw new Error(`Expected '${char}' but got '${this.peek()}' at position ${this.pos}`);
    }
    this.consume();
  }

  private skipWhitespace() {
    while (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\n') {
      this.consume();
    }
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isLetter(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
  }
}