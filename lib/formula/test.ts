// Quick formula engine test

import { evaluateFormula } from './index';

// Mock table columns
const columns = [
  { id: 'col1', name: 'Price', type: 'number' },
  { id: 'col2', name: 'Quantity', type: 'number' },
  { id: 'col3', name: 'Tax Rate', type: 'number' },
  { id: 'col4', name: 'Product', type: 'text' },
];

// Mock row data
const rowData = {
  col1: '10.50',  // Price
  col2: '5',      // Quantity
  col3: '0.08',   // Tax Rate (8%)
  col4: 'Widget', // Product
};

console.log('🧪 Testing Formula Engine\n');

// Test 1: Simple arithmetic
const test1 = evaluateFormula('{Price} * {Quantity}', rowData, columns);
console.log('Test 1: {Price} * {Quantity}');
console.log('Expected: 52.5');
console.log('Result:', test1);
console.log('✅ PASS:', test1.success && test1.value === 52.5);
console.log('');

// Test 2: Complex expression
const test2 = evaluateFormula('({Price} * {Quantity}) * (1 + {Tax Rate})', rowData, columns);
console.log('Test 2: ({Price} * {Quantity}) * (1 + {Tax Rate})');
console.log('Expected: 56.7');
console.log('Result:', test2);
console.log('✅ PASS:', test2.success && test2.value === 56.7);
console.log('');

// Test 3: SUM function
const test3 = evaluateFormula('SUM({Price}, {Quantity}, {Tax Rate})', rowData, columns);
console.log('Test 3: SUM({Price}, {Quantity}, {Tax Rate})');
console.log('Expected: 15.58');
console.log('Result:', test3);
console.log('✅ PASS:', test3.success && test3.value === 15.58);
console.log('');

// Test 4: AVG function
const test4 = evaluateFormula('AVG({Price}, {Quantity})', rowData, columns);
console.log('Test 4: AVG({Price}, {Quantity})');
console.log('Expected: 7.75');
console.log('Result:', test4);
console.log('✅ PASS:', test4.success && test4.value === 7.75);
console.log('');

// Test 5: ROUND function
const test5 = evaluateFormula('ROUND({Price} * {Quantity}, 2)', rowData, columns);
console.log('Test 5: ROUND({Price} * {Quantity}, 2)');
console.log('Expected: 52.5');
console.log('Result:', test5);
console.log('✅ PASS:', test5.success && test5.value === 52.5);
console.log('');

// Test 6: IF function
const test6 = evaluateFormula('IF({Quantity} > 3, "High", "Low")', rowData, columns);
console.log('Test 6: IF({Quantity} > 3, "High", "Low")');
console.log('Expected: "High"');
console.log('Result:', test6);
console.log('✅ PASS:', test6.success && test6.value === 'High');
console.log('');

// Test 7: CONCAT function
const test7 = evaluateFormula('CONCAT({Product}, " - $", {Price})', rowData, columns);
console.log('Test 7: CONCAT({Product}, " - $", {Price})');
console.log('Expected: "Widget - $10.5"');
console.log('Result:', test7);
console.log('✅ PASS:', test7.success && test7.value === 'Widget - $10.5');
console.log('');

// Test 8: Error handling
const test8 = evaluateFormula('{InvalidColumn} * 5', rowData, columns);
console.log('Test 8: {InvalidColumn} * 5 (should error)');
console.log('Result:', test8);
console.log('✅ PASS:', !test8.success && test8.error);
console.log('');

// Test 9: Division by zero
const test9 = evaluateFormula('10 / 0', rowData, columns);
console.log('Test 9: 10 / 0 (should error)');
console.log('Result:', test9);
console.log('✅ PASS:', !test9.success && test9.error?.includes('Division by zero'));
console.log('');

console.log('🎉 All tests completed!');