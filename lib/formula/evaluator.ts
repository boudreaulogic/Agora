// Formula Evaluator - Executes parsed formula nodes

import { FormulaNode } from './parser';

export class FormulaEvaluator {
  private rowData: Record<string, any>;
  private columnMap: Map<string, string>; // columnName -> columnId

  constructor(rowData: Record<string, any>, columns: any[]) {
    this.rowData = rowData;
    this.columnMap = new Map(columns.map(col => [col.name, col.id]));
  }

  evaluate(node: FormulaNode): any {
    switch (node.type) {
      case 'number':
        return node.value;

      case 'string':
        return node.value;

      case 'boolean':
        return node.value;

      case 'column':
        return this.evaluateColumn(node.columnId);

      case 'operator':
        return this.evaluateOperator(node);

      case 'comparison':
        return this.evaluateComparison(node);

      case 'function':
        return this.evaluateFunction(node);

      case 'error':
        throw new Error(node.message);

      default:
        throw new Error(`Unknown node type`);
    }
  }

  private evaluateColumn(columnName: string): any {
    // Resolve column name to column ID
    const columnId = this.columnMap.get(columnName);
    
    if (!columnId) {
      throw new Error(`Column not found: ${columnName}`);
    }

    const value = this.rowData[columnId];
    
    // Convert to number if it's a numeric string
    if (typeof value === 'string' && !isNaN(Number(value))) {
      return Number(value);
    }
    
    return value ?? 0;
  }

  private evaluateOperator(node: Extract<FormulaNode, { type: 'operator' }>): number {
    const left = this.evaluate(node.left);
    const right = this.evaluate(node.right);

    // Convert to numbers
    const a = Number(left);
    const b = Number(right);

    if (isNaN(a) || isNaN(b)) {
      throw new Error('Cannot perform arithmetic on non-numeric values');
    }

    switch (node.op) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '*':
        return a * b;
      case '/':
        if (b === 0) throw new Error('Division by zero');
        return a / b;
      case '%':
        if (b === 0) throw new Error('Division by zero');
        return a % b;
      default:
        throw new Error(`Unknown operator: ${node.op}`);
    }
  }

  private evaluateComparison(node: Extract<FormulaNode, { type: 'comparison' }>): boolean {
    const left = this.evaluate(node.left);
    const right = this.evaluate(node.right);

    // Try to convert to numbers if both are numeric
    const leftNum = Number(left);
    const rightNum = Number(right);

    // Use numeric comparison if both are numbers
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      switch (node.op) {
        case '>':
          return leftNum > rightNum;
        case '<':
          return leftNum < rightNum;
        case '>=':
          return leftNum >= rightNum;
        case '<=':
          return leftNum <= rightNum;
        case '==':
          return leftNum === rightNum;
        case '!=':
          return leftNum !== rightNum;
        default:
          throw new Error(`Unknown comparison operator: ${node.op}`);
      }
    }

    // Otherwise use string comparison
    switch (node.op) {
      case '>':
        return String(left) > String(right);
      case '<':
        return String(left) < String(right);
      case '>=':
        return String(left) >= String(right);
      case '<=':
        return String(left) <= String(right);
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      default:
        throw new Error(`Unknown comparison operator: ${node.op}`);
    }
  }

  private evaluateFunction(node: Extract<FormulaNode, { type: 'function' }>): any {
    const { name, args } = node;

    switch (name) {
      case 'SUM':
        return args.reduce((sum, arg) => sum + Number(this.evaluate(arg)), 0);

      case 'AVG':
        if (args.length === 0) return 0;
        return args.reduce((sum, arg) => sum + Number(this.evaluate(arg)), 0) / args.length;

      case 'MIN':
        if (args.length === 0) return 0;
        return Math.min(...args.map(arg => Number(this.evaluate(arg))));

      case 'MAX':
        if (args.length === 0) return 0;
        return Math.max(...args.map(arg => Number(this.evaluate(arg))));

      case 'COUNT':
        return args.filter(arg => this.evaluate(arg) != null).length;

      case 'ROUND':
        if (args.length === 0) return 0;
        const value = Number(this.evaluate(args[0]));
        const decimals = args.length > 1 ? Number(this.evaluate(args[1])) : 0;
        return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);

      case 'ABS':
        if (args.length === 0) return 0;
        return Math.abs(Number(this.evaluate(args[0])));

      case 'SQRT':
        if (args.length === 0) return 0;
        return Math.sqrt(Number(this.evaluate(args[0])));

      case 'IF':
        // IF(condition, trueValue, falseValue)
        if (args.length < 2) throw new Error('IF requires at least 2 arguments');
        const condition = this.evaluate(args[0]);
        
        // Treat any truthy value as true
        const isTrue = Boolean(condition);
        
        return isTrue ? this.evaluate(args[1]) : (args[2] ? this.evaluate(args[2]) : null);

      case 'CONCAT':
        return args.map(arg => String(this.evaluate(arg))).join('');

      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }
}