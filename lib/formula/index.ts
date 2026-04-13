// Formula Engine - Main entry point

import { FormulaParser } from './parser';
import { FormulaEvaluator } from './evaluator';

export function evaluateFormula(
  formula: string,
  rowData: Record<string, any>,
  columns: any[]
): { success: boolean; value?: any; error?: string } {
  try {
    const parser = new FormulaParser();
    const ast = parser.parse(formula);

    if (ast.type === 'error') {
      return { success: false, error: ast.message };
    }

    const evaluator = new FormulaEvaluator(rowData, columns);
    const value = evaluator.evaluate(ast);

    return { success: true, value };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Evaluation error',
    };
  }
}

// Export types
export type { FormulaNode } from './parser';
export { FormulaParser } from './parser';
export { FormulaEvaluator } from './evaluator';