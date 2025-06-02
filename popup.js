document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const saveButton = document.getElementById('saveButton');
  const statusDiv = document.getElementById('status');
  
  // Load saved API key if it exists
  chrome.storage.local.get(['geminiApiKey'], function(result) {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
  });
  
  saveButton.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      statusDiv.textContent = 'Please enter a valid API key';
      statusDiv.className = 'status error';
      return;
    }
    
    // Save API key to storage
    chrome.storage.local.set({geminiApiKey: apiKey}, function() {
      statusDiv.textContent = 'API key saved successfully!';
      statusDiv.className = 'status success';
      
      // Clear status message after 3 seconds
      setTimeout(function() {
        statusDiv.textContent = '';
        statusDiv.className = 'status';
      }, 3000);
    });
  });
});

document.addEventListener('DOMContentLoaded', function() {
  const popupSimplifyButton = document.getElementById('popupSimplifyButton');
  const popupSimplifiedResult = document.getElementById('popupSimplifiedResult');

  popupSimplifyButton.addEventListener('click', function() {
    popupSimplifiedResult.textContent = "Processing...";
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        func: () => {
          const problemStatementDiv = document.querySelector('.problem-statement');
          if (!problemStatementDiv) return null;
          
          const children = problemStatementDiv.children;
          let selectedContent = '';
          
          // Get the second div (index 1), third div (input-specification), and fourth div (output-specification)
          for (let i = 0; i < children.length; i++) {
            const child = children[i];
            
            // Skip the header div (first div)
            if (i === 0 && child.classList.contains('header')) {
              continue;
            }
            
            // Get the second div (problem description)
            if (i === 1) {
              selectedContent += child.outerHTML;
              continue;
            }
            
            // Get input-specification div
            if (child.classList.contains('input-specification')) {
              selectedContent += child.outerHTML;
              continue;
            }
            
            // Get output-specification div
            if (child.classList.contains('output-specification')) {
              selectedContent += child.outerHTML;
              continue;
            }
          }
          
          // Convert HTML to text for API call
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = selectedContent;
          return tempDiv.innerText;
        },
      }, async (results) => {
        if (!results || !results[0] || !results[0].result) {
          popupSimplifiedResult.textContent = "Problem statement not found on this page.";
          return;
        }
        const problemText = results[0].result;
        chrome.storage.local.get(['geminiApiKey'], async function(result) {
          const apiKey = result.geminiApiKey;
          if (!apiKey) {
            popupSimplifiedResult.textContent = "API key not set.";
            return;
          }
          try {
            const simplifiedText = await callGeminiAPI(problemText, apiKey);
            chrome.scripting.executeScript({
              target: {tabId: tabs[0].id},
              func: (simplifiedText) => {
                const problemDiv = document.querySelector('.problem-statement');
                if (!problemDiv) return;
                
                // Get the specific divs we want to replace
                const children = Array.from(problemDiv.children);
                let targetDivs = [];
                
                for (let i = 0; i < children.length; i++) {
                  const child = children[i];
                  
                  // Get the second div (problem description)
                  if (i === 1) {
                    targetDivs.push(child);
                    continue;
                  }
                  
                  // Get input-specification div
                  if (child.classList.contains('input-specification')) {
                    targetDivs.push(child);
                    continue;
                  }
                  
                  // Get output-specification div
                  if (child.classList.contains('output-specification')) {
                    targetDivs.push(child);
                    continue;
                  }
                }
                
                // Store original HTML and positions
                const originalData = targetDivs.map(div => ({
                  element: div,
                  html: div.outerHTML,
                  parent: div.parentNode,
                  nextSibling: div.nextSibling
                }));
                
                // Create container for simplified content
                const simplifiedContainer = document.createElement('div');
                simplifiedContainer.innerHTML = simplifiedText;
                simplifiedContainer.style.backgroundColor = '#f0f8ff';
                simplifiedContainer.style.padding = '10px';
                simplifiedContainer.style.border = '1px solid #ccc';
                simplifiedContainer.style.borderRadius = '5px';
                simplifiedContainer.style.display = 'block'; // Show by default
                simplifiedContainer.style.marginBottom = '10px';
                
                // Insert simplified container after the last target div
                const lastDiv = targetDivs[targetDivs.length - 1];
                lastDiv.parentNode.insertBefore(simplifiedContainer, lastDiv.nextSibling);
                
                // Create toggle button if not exists
                let toggleBtn = document.getElementById('cf-simplify-toggle');
                if (!toggleBtn) {
                  toggleBtn = document.createElement('button');
                  toggleBtn.id = 'cf-simplify-toggle';
                  toggleBtn.textContent = 'Show Original';
                  toggleBtn.style.margin = '10px';
                  toggleBtn.style.padding = '5px 15px';
                  toggleBtn.style.backgroundColor = '#ff6b6b';
                  toggleBtn.style.color = 'white';
                  toggleBtn.style.border = 'none';
                  toggleBtn.style.borderRadius = '3px';
                  toggleBtn.style.cursor = 'pointer';
                  toggleBtn.style.position = 'relative';
                  toggleBtn.style.top = '90px';
                  toggleBtn.style.left = '-3px';
                  problemDiv.parentNode.insertBefore(toggleBtn, problemDiv);
                }
                
                let showingSimplified = true;
                // Hide original content initially
                targetDivs.forEach(div => div.style.display = 'none');
                
                toggleBtn.onclick = function() {
                  if (showingSimplified) {
                    // Show original content
                    targetDivs.forEach(div => div.style.display = '');
                    simplifiedContainer.style.display = 'none';
                    toggleBtn.textContent = 'Show Simplified';
                    toggleBtn.style.backgroundColor = '#4CAF50';
                  } else {
                    // Show simplified content
                    targetDivs.forEach(div => div.style.display = 'none');
                    simplifiedContainer.style.display = 'block';
                    toggleBtn.textContent = 'Show Original';
                    toggleBtn.style.backgroundColor = '#ff6b6b';
                  }
                  showingSimplified = !showingSimplified;
                };
              },
              args: [simplifiedText]
            });
            popupSimplifiedResult.innerHTML = "Done!";
          } catch (e) {
            popupSimplifiedResult.textContent = "Error: " + e.message;
          }
        });
      });
    });
  });
  
  async function callGeminiAPI(problemText, apiKey) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const prompt = `
          You are given a Codeforces programming problem. Your task is to rewrite it in simpler, clearer English for beginner programmers — without solving it or giving any hints about the solution
    
          Here are the rules you MUST follow:
    
          1. Preserve every detail from the original — including:
            - Inputs, outputs, edge cases, constraints, limits
            - Mathematical relationships, rules, and examples
            - Descriptions of game rules, scoring, or multi-step logic
    
          2. Do NOT include any solutions, hints, strategies, or "Key Ideas". Just rewrite the *description* clearly
    
          3. Make it easier to read by:
            - Rewriting complex sentences into shorter, simpler ones
            - Using everyday words when possible
            - Structuring content with HTML: use '<p>' for paragraphs and '<ul>' and '<ol>' for lists
    
          4. Assume the reader is new to competitive programming and may struggle with long or technical sentences.
    
          Now, rewrite the following problem accordingly:
          ${problemText}
        `;
    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: prompt
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048
        }
    };
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to call Gemini API');
    }
    const data = await response.json();
    if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
      throw new Error('No response from Gemini API. Please check your API key and try again.');
    }
    let responseText = data.candidates[0].content.parts[0].text;

    // Remove (```html) from the beginning and (```) from the end if they exist
    responseText = responseText.replace(/^```html\s*\n?/, '');
    responseText = responseText.replace(/\n?```\s*$/, '');

    return responseText;
}
});