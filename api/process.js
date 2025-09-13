// Mental Health Care Plan API - Simplified Vercel Function
// This is the ONLY file you need to deploy to Vercel

export default async function handler(req, res) {
    // Enable CORS for Wix Studio embedding
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            error: 'Method not allowed. Please use POST.' 
        });
    }

    try {
        // Validate OpenAI API key
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ 
                error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to your Vercel environment variables.' 
            });
        }

        // Extract form data
        const { 
            presentingcomplaintproblem, 
            mentalstateexamination, 
            outcomemeasures, 
            managementsummary 
        } = req.body;

        // Validate required fields
        if (!presentingcomplaintproblem || !mentalstateexamination || !outcomemeasures || !managementsummary) {
            return res.status(400).json({ 
                error: 'All fields are required: Presenting Complaint/Problem, Mental State Examination, Outcome Measures, and Management Summary.' 
            });
        }

        // Basic PII detection (prevent accidental patient identifiers)
        const piiPatterns = [
            /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card numbers
            /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/, // SSN format
            /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email addresses
            /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ // Phone numbers
        ];

        const allText = `${presentingcomplaintproblem} ${mentalstateexamination} ${outcomemeasures} ${managementsummary}`;
        
        for (const pattern of piiPatterns) {
            if (pattern.test(allText)) {
                return res.status(400).json({ 
                    error: 'Please remove any personal identifiers (phone numbers, emails, etc.) from your input. Use anonymized clinical data only.' 
                });
            }
        }

        // Hard-coded Australian GP Medical Prompt (exactly as specified)
        const MEDICAL_PROMPT = `I am an Australian GP in Western Australia creating a Mental Health Treatment Plan. Please analyze the following patient presentation and provide a comprehensive treatment plan following Australian RACGP guidelines.

Patient Brief: [Insert your 2-3 sentence patient description here]

Please structure your response using these exact headings:

Presenting Complaint/Problem

Mental Health History/Previous Treatment

Family History of Mental Illness

Social History

Relevant Medical Conditions/Investigations/Allergies

Current Medications

Mental State Examination (Keep simple, one point per line covering: Appearance, Behaviour, Speech, Mood, Affect, Thought Process, Thought Content, Perceptions, Cognition, Insight, Judgment)

Outcome Tool/Result

Risk & Co-morbidity Assessment

Diagnosis/Provisional Diagnosis

Problems/Needs

Patient Goals

Patient Actions & Treatment

Ensure all recommendations align with Australian mental health guidelines, Medicare requirements, and Western Australian health policies. Include appropriate safety netting and follow-up scheduling.`;

        // Combine patient data with medical prompt
        const patientData = `
PRESENTING COMPLAINT/PROBLEM:
${presentingcomplaintproblem}

MENTAL STATE EXAMINATION:
${mentalstateexamination}

OUTCOME MEASURES:
${outcomemeasures}

MANAGEMENT SUMMARY:
${managementsummary}
        `.trim();

        const fullPrompt = `${MEDICAL_PROMPT}

PATIENT PRESENTATION DATA:
${patientData}

Please generate a comprehensive Mental Health Care Plan following the structure outlined above.`;

        // Call OpenAI API
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an experienced Australian General Practitioner specializing in mental health care plans. Provide professional, evidence-based medical recommendations following Australian RACGP guidelines and Western Australian health policies. Always maintain clinical professionalism and include appropriate safety netting.'
                    },
                    {
                        role: 'user',
                        content: fullPrompt
                    }
                ],
                max_tokens: 4000,
                temperature: 0.3, // Lower temperature for more consistent medical advice
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0
            }),
        });

        if (!openaiResponse.ok) {
            const errorData = await openaiResponse.json().catch(() => ({}));
            console.error('OpenAI API Error:', errorData);
            
            if (openaiResponse.status === 401) {
                return res.status(500).json({ 
                    error: 'OpenAI API authentication failed. Please check your API key configuration.' 
                });
            } else if (openaiResponse.status === 429) {
                return res.status(429).json({ 
                    error: 'API rate limit exceeded. Please wait a moment and try again.' 
                });
            } else {
                return res.status(500).json({ 
                    error: `OpenAI API error: ${errorData.error?.message || 'Unknown error'}` 
                });
            }
        }

        const openaiData = await openaiResponse.json();
        
        if (!openaiData.choices || !openaiData.choices[0] || !openaiData.choices[0].message) {
            return res.status(500).json({ 
                error: 'Invalid response from OpenAI API' 
            });
        }

        const generatedReport = openaiData.choices[0].message.content;

        // Add professional header and footer to the report
        const finalReport = `MENTAL HEALTH CARE PLAN
Generated: ${new Date().toLocaleString('en-AU', { 
            timeZone: 'Australia/Perth',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        })} (Perth, WA)
Compliant with: Australian RACGP Guidelines & Western Australian Health Policies

${generatedReport}

---
IMPORTANT DISCLAIMER:
This report is generated for clinical decision support only. Always use professional clinical judgment and consider individual patient circumstances. Follow up with appropriate specialists as indicated. This system is designed to assist Australian medical professionals and should be used in conjunction with clinical assessment.

Generated by: Mental Health Care Plan Assistant
Compliance: Australian RACGP Guidelines, Medicare Requirements, WA Health Policies`;

        // Return the formatted report
        return res.status(200).json({
            success: true,
            report: finalReport,
            timestamp: new Date().toISOString(),
            tokens_used: openaiData.usage?.total_tokens || 'unknown'
        });

    } catch (error) {
        console.error('Server Error:', error);
        
        // Handle specific error types
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            return res.status(500).json({ 
                error: 'Network error connecting to OpenAI API. Please try again.' 
            });
        }
        
        if (error.message.includes('JSON')) {
            return res.status(400).json({ 
                error: 'Invalid request format. Please check your input data.' 
            });
        }

        return res.status(500).json({ 
            error: `Server error: ${error.message}` 
        });
    }
}
