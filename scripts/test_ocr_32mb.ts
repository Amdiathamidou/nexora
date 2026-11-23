import 'dotenv/config';
import { analyzeMailDocumentWithGemini } from '../server/services/geminiService.ts';

async function test() {
  const filePath = 'data/uploads/cmp_demo_group/1795467128572_doc_ff79ede9-4662-4f1e-932e-069f21a97ab0.pdf';
  console.log('Testing extraction on 32.5 MB scanned PDF...');
  const result = await analyzeMailDocumentWithGemini({
    filePath,
    mimeType: 'application/pdf',
    companyServices: [
      { id: '1', name: 'Direction Technique Nationale' },
      { id: '2', name: 'Secrétariat Général' },
    ],
    companyName: 'Fédération Béninoise de Football',
  });
  console.log('\n--- EXTRACTION RESULT ---');
  console.log('Subject :', result.subject);
  console.log('Sender :', result.senderName, '(', result.senderOrg, ')');
  console.log('Recipient :', result.recipientName, '(', result.recipientOrg, ')');
  console.log('Date :', result.mailDate);
  console.log('Priority :', result.suggestedPriority);
  console.log('Service :', result.suggestedServiceName);
  console.log('Short Summary :', result.shortSummary);
  console.log('OCR text length :', result.ocrText?.length);
  console.log('OCR text preview :', result.ocrText?.slice(0, 300));
}

test()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
