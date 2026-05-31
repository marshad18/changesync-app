import { listDocuments } from '../server/db.ts';
const docs = await listDocuments();
docs.forEach(d => console.log(JSON.stringify({ id: d.id, name: d.name, code: d.code, category: d.category })));
