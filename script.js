import { Marked } from 'https://cdn.jsdelivr.net/npm/marked@13/+esm';
// Initialize Mermaid for diagram generation
mermaid.initialize({ startOnLoad: false });

// Replace with your actual OpenAI API key
let OPENAI_API_KEY;
try {
  OPENAI_API_KEY = (await fetch("https://llmfoundry.straive.com/token", { credentials: "include" }).then((r) => r.json())).token;
} catch {
  OPENAI_API_KEY = null;
}

// Elements
const fileInput = document.getElementById('fileInput');
const sqlAccordion = document.getElementById('sqlAccordion');
const overviewDiv = document.getElementById('overview');
const generateDiagramBtn = document.getElementById('generateDiagramBtn');
const diagramDiv = document.getElementById('diagram');
const convertBtn = document.getElementById('convertBtn');
const convertedCodeDiv = document.getElementById('convertedCode');
const verifyBtn = document.getElementById('verifyBtn');
const verificationResultDiv = document.getElementById('verificationResult');
const marked = new Marked();

let sqlContent = '';
let overviewText = '';
let convertedCode = '';

// Handle File Upload
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.name.endsWith('.sql')) {
        const reader = new FileReader();
        reader.onload = function(evt) {
            sqlContent = evt.target.result;
            displaySQLContent(sqlContent);
            generateOverview(sqlContent);
        };
        reader.readAsText(file);
    } else {
        alert('Please upload a valid .sql file.');
    }
});

// Elements
const loadEmployeeDataBtn = document.getElementById('loadEmployeeDataBtn');

// Load Employee Data
loadEmployeeDataBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('Sql_file_v2.sql'); // Update with the correct path to your SQL file
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        sqlContent = await response.text();
        displaySQLContent(sqlContent);
        generateOverview(sqlContent);
    } catch (error) {
        console.error('Error loading employee data:', error);
        alert('Failed to load employee data. Please try again later.');
    }
});

// Display SQL Content in Accordion
function displaySQLContent(content) {
    sqlAccordion.innerHTML = ''; // Clear previous content
    const accordionItem = document.createElement('div');
    accordionItem.classList.add('accordion-item');

    const headerId = 'headingOne';
    const collapseId = 'collapseOne';

    accordionItem.innerHTML = `
        <h2 class="accordion-header" id="${headerId}">
            <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="true" aria-controls="${collapseId}">
                Uploaded SQL Server Code
            </button>
        </h2>
        <div id="${collapseId}" class="accordion-collapse collapse show" aria-labelledby="${headerId}" data-bs-parent="#sqlAccordion">
            <div class="accordion-body">
                <pre style="white-space: pre-wrap;">${escapeHTML(content)}</pre>
            </div>
        </div>
    `;
    sqlAccordion.appendChild(accordionItem);
}

// Generate Overview using OpenAI API
async function generateOverview(sql) {
    overviewDiv.innerHTML = 'Generating overview...';
    const prompt = `Provide a short overview of the following SQL Server code, focusing on data types, stored procedures, functions, transactions, etc.\n\n${sql}`;

    const response = await callOpenAI(prompt);
    overviewText = response;
    const html_response = marked.parse(overviewText)
    overviewDiv.innerHTML = html_response;
}

// Generate ERD Diagram
generateDiagramBtn.addEventListener('click', async () => {
    if (!sqlContent) {
        alert('No SQL Server code to analyze for ERD generation.');
        return;
    }

    diagramDiv.innerHTML = 'Generating ERD diagram...';

    // Define the prompt for ERD generation
    const prompt = `
        I have a SQL Server database schema, and I need to generate an Entity-Relationship Diagram (ERD) in Mermaid.js format. The ERD should include the following details:

        1. **Entities (Tables):**
           - List all tables in the schema.
           - Include the table name and its attributes.

        2. **Attributes (Columns):**
           - For each table, list all columns with their simplified data types.
           - Highlight primary keys, foreign keys, and unique constraints.

        3. **Output Format:**
           - Provide the ERD **only** in Mermaid.js format. Do not include any additional text or explanation.
           - Use the following structure for each table:
             \`\`\`
             erDiagram
                 TABLE_NAME {
                     COLUMN_TYPE COLUMN_NAME PK/FK/Unique (if applicable)
                     ...
                 }
             \`\`\`

        Here is the SQL Server schema:

        ${sqlContent}

        Generate the ERD in Mermaid.js format only.
        additional requirements:-
        Please create a generic Mermaid.js ER diagram following these rules:
        Use unique and simple entity names (no schema prefixes).
        Only use letters, numbers, and underscores in entity names (no spaces or special characters).
        Apply the correct Mermaid.js relationship syntax (e.g., ||--o{ for one-to-many relationships).
        Ensure that the entity names are unique and the relationships between them are properly defined.
        Simplify data types to basic types (e.g., INT, VARCHAR, DATE) without precision or scale.
        `;

    // Call OpenAI API to generate the ERD description
    const ress = await callOpenAI(prompt);
    const lines = ress.split('\n');

    // Remove the first and last line
    const response = lines.slice(1, -1).join('\n');

    console.log(response);


    if (response) {
        // Render the Mermaid.js diagram directly
        diagramDiv.innerHTML = `<div class="mermaid">${response}</div>`;
        mermaid.init();
    } else {
        diagramDiv.innerHTML = 'Failed to generate ERD diagram.';
    }
});

// Utility function to call OpenAI API
// async function callOpenAI(prompt) {
//     try {
//         const response = await fetch('https://llmfoundry.straive.com/openai/v1/chat/completions', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//                 'Authorization': `Bearer ${OPENAI_API_KEY}`
//             },
//             body: JSON.stringify({
//                 model: 'gpt-4o-mini',
//                 messages: [{ role: 'user', content: prompt }],
//                 max_tokens: 2000,
//                 temperature: 0.2,
//             })
//         });

//         const data = await response.json();
//         if (data.choices && data.choices.length > 0) {
//             return data.choices[0].message.content.trim();
//         } else {
//             return 'No response from OpenAI.';
//         }
//     } catch (error) {
//         console.error('Error calling OpenAI API:', error);
//         return 'Error communicating with OpenAI API.';
//     }
// }

// Convert to PostgreSQL using OpenAI API
convertBtn.addEventListener('click', async () => {
    if (!sqlContent) {
        alert('No SQL Server code to convert.');
        return;
    }
    convertedCodeDiv.innerHTML = 'Converting to PostgreSQL...';
//     const prompt = `I have a SQL Server database script that I need to convert to PostgreSQL. The conversion should be accurate, preserving all data types, stored procedures, functions, transactions, indexes, constraints, and relationships. Please follow these steps meticulously to ensure the converted code is fully functional in PostgreSQL.

// --- Original SQL Server Code ---
// [Insert Your SQL Server .sql File Content Here]
// ---

// ### **Conversion Steps:**

// 1. **Schema and Table Conversion:**
//    - Translate all CREATE TABLE statements.
//    - Convert SQL Server data types to their PostgreSQL equivalents.
//    - Retain primary keys, foreign keys, unique constraints, and default values.

// 2. **Indexes and Constraints:**
//    - Convert all CREATE INDEX statements.
//    - Translate constraints like CHECK, NOT NULL, etc.

// 3. **Stored Procedures and Functions:**
//    - Rewrite all CREATE PROCEDURE and CREATE FUNCTION statements.
//    - Adapt T-SQL syntax to PL/pgSQL, ensuring logic integrity.

// 4. **Triggers:**
//    - Convert any triggers from SQL Server to PostgreSQL syntax.

// 5. **Transactions:**
//    - Ensure that transaction controls (BEGIN, COMMIT, ROLLBACK) are compatible with PostgreSQL.

// 6. **Data Migration Scripts:**
//    - Adjust any data import/export scripts to fit PostgreSQL's COPY or \COPY commands.

// 7. **Sequences and Identity Columns:**
//    - Translate IDENTITY columns to PostgreSQL SERIAL or GENERATED columns.
//    - Create sequences where necessary.

// 8. **Views:**
//    - Convert all CREATE VIEW statements to PostgreSQL syntax.

// 9. **Error Handling:**
//    - Adapt any error-handling mechanisms to PostgreSQL's exception handling.

// 10. **Testing and Validation:**
//     - Provide SQL statements to test the integrity and functionality of the converted database.

// ### **Output Requirements:**

// - Provide the complete converted PostgreSQL script segmented by the above steps.
// - Ensure the syntax is compatible with PostgreSQL 13 or later.
// - Highlight any assumptions or modifications made during the conversion process.
// - Include comments in the SQL script for clarity where significant changes were made.

// ### **Example Output:**

// sql
// -- Step 1: Schema and Table Conversion
// CREATE TABLE customers (
//     customer_id SERIAL PRIMARY KEY,
//     name VARCHAR(255) NOT NULL,
//     email VARCHAR(255) UNIQUE NOT NULL
// );

// -- Step 2: Indexes and Constraints
// CREATE INDEX idx_customers_email ON customers(email);

// -- ... continue with other steps`;

const prompt = `I have a SQL Server database script that I need to convert to PostgreSQL. The conversion should be accurate, preserving all data types, stored procedures, functions, transactions, indexes, constraints, and relationships. Please follow these steps meticulously to ensure the converted code is fully functional in PostgreSQL.

--- Original SQL Server Code ---
    ${sqlContent}
---
## **Conversion Steps:**
1. **Schema and Table Conversion:**
   - Translate all CREATE TABLE statements.
   - Convert SQL Server data types to their PostgreSQL equivalents.
   - Retain primary keys, foreign keys, unique constraints, and default values.
2. **Indexes and Constraints:**
   - Convert all CREATE INDEX statements.
   - Translate constraints like CHECK, NOT NULL, etc.
3. **Stored Procedures and Functions:**
   - Rewrite all CREATE PROCEDURE and CREATE FUNCTION statements.
   - Adapt T-SQL syntax to PL/pgSQL, ensuring logic integrity.
4. **Triggers:**
   - Convert any triggers from SQL Server to PostgreSQL syntax.
5. **Transactions:**
   - Ensure that transaction controls (BEGIN, COMMIT, ROLLBACK) are compatible with PostgreSQL.
6. **Data Migration Scripts:**
   - Adjust any data import/export scripts to fit PostgreSQL's COPY or \COPY commands.
7. **Sequences and Identity Columns:**
   - Translate IDENTITY columns to PostgreSQL SERIAL or GENERATED columns.
   - Create sequences where necessary.
8. **Views:**
   - Convert all CREATE VIEW statements to PostgreSQL syntax.
9. **Error Handling:**
   - Adapt any error-handling mechanisms to PostgreSQL's exception handling.
10. **Testing and Validation:**
    - Provide SQL statements to test the integrity and functionality of the converted database.
## **Output Requirements:**
- Provide the complete converted PostgreSQL script segmented only.
- Ensure the syntax is compatible with PostgreSQL 13 or later.
## **Example Output:**
only provide the converted code in PostgreSQL format
`;

    const response = await callOpenAI(prompt);
    convertedCode = response;
    convertedCodeDiv.innerHTML = marked.parse(response);
});

// Verify Conversion using OpenAI API
verifyBtn.addEventListener('click', async () => {
    if (!convertedCode) {
        alert('No converted PostgreSQL code to verify.');
        return;
    }
    verificationResultDiv.innerHTML = 'Verifying the converted code...';
    const prompt = `Check the following PostgreSQL code and the original SQL Server code. Confirm whether the conversion is accurate and free of errors.\n\nOriginal SQL Server Code:\n${sqlContent}\n\nConverted PostgreSQL Code:\n${convertedCode}\n\nProvide your verification below.`;

    const response = await callOpenAI(prompt);
    verificationResultDiv.innerHTML = marked.parse(response);
});

// Function to call OpenAI API
async function callOpenAI(prompt) {
    try {
        const response = await fetch('https://llmfoundry.straive.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 2000,
                temperature: 0.2,
            })
        });

        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            return data.choices[0].message.content.trim();
        } else {
            return 'No response from OpenAI.';
        }
    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        return 'Error communicating with OpenAI API.';
    }
}

// Utility function to escape HTML
function escapeHTML(str) {
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");
}

