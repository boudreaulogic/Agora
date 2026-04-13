const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const buf = fs.readFileSync('/app/uploads/templates/3acc7f15-5ee8-4e70-93ad-3f8422326197.pdf');
PDFDocument.load(buf).then(doc => {
  const form = doc.getForm();
  const fields = form.getFields();
  console.log('Total fields:', fields.length);
  fields.slice(0, 5).forEach(f => {
    console.log(f.getName(), '-', f.constructor.name);
  });
  try {
    const tf = form.getTextField('company');
    tf.setText('TEST VALUE');
    console.log('setText worked!');
  } catch(e) {
    console.log('Error:', e.message);
  }
});
