# PageSummarizer Chrome Extension

**PageSummarizer** lets you capture any web page’s text and screenshot, generate a concise bullet-point summary via the Groq Chat API, store a searchable history, and ask follow-up questions using a smart Retrieval-Augmented Generation (RAG) system—right from your browser.

---

## 🚀 Features

- **Full-page extraction**: Automatically picks out the main article or content block from any webpage.
- **On-demand summary**: Generates bullet-point summaries using Groq’s fast Llama 3 API.
- **Visual reference**: Captures and displays a screenshot of the page for context.
- **Persistent history**: Stores summaries and all processed data locally in your dashboard.
- **Smart Q&A with Advanced RAG**:
  - **Semantic Chunking**: Instead of naive paragraph splitting, the page text is divided into thematically coherent chunks based on sentence similarity.
  - **Diverse Retrieval**: Uses **Maximal Marginal Relevance (MMR)** to fetch context that is both relevant to your question and diverse, avoiding redundant information.
- **Clear history**: One-click button to purge all stored data.
- **Privacy-first**: Requires you to set your own API keys in the extension's options. No secrets are ever stored in the code.

---

## 📦 Installation

1.  **Clone this repository**
    ```bash
    git clone https://github.com/pranavsaji/page-summarizer-QA-extension.git
    cd page-summarizer-QA-extension
    ```

2.  **Open Chrome and navigate to the Extensions page**
    - Go to `chrome://extensions` or click the puzzle-piece icon in your toolbar, then "Manage Extensions".

3.  **Enable Developer Mode**
    - Find the "Developer mode" toggle in the top-right corner and turn it on.

4.  **Load the extension**
    - Click the "Load unpacked" button.
    - Select the `page-summarizer-QA-extension` folder that you cloned. The extension should now appear in your list.

---

## ⚙️ Configuration

Before using the extension, you must set your API keys.

1.  Right-click the PageSummarizer extension icon in your Chrome toolbar and select "Options".
2.  Enter your **Groq API Key** for summarization and Q&A.
3.  Enter your **Hugging Face API Key** (a User Access Token with `read` permissions) for text embeddings.
4.  Click "Save". Your keys are stored locally and securely.

---

## 📖 How to Use

1.  Navigate to any article or page you want to summarize.
2.  Click the PageSummarizer icon in your toolbar and select **"Summarize Page"**.
3.  To view your saved content, click the icon again and select **"Open Dashboard"**.
4.  In the dashboard, click on any entry from the history list on the left.
5.  In the detail view, you can read the summary, see the screenshot, and ask follow-up questions in the "Ask a Question" box.

---

## 🧠 Smarter RAG: How It Works

This extension uses an advanced Retrieval-Augmented Generation (RAG) pipeline to provide accurate answers. Instead of just sending the whole document to an LLM (which is inefficient and often impossible), it intelligently finds the most relevant pieces of information first.

### 1. Semantic Chunking (`background.js`)

When you summarize a page, the text is broken down using a smart strategy.

-   **The Problem:** Simple chunking (e.g., by paragraph) is unreliable. A single paragraph can contain multiple topics, or one idea can span several paragraphs, leading to incomplete context.
-   **The Solution:** We use **Semantic Chunking**. The text is split into individual sentences. Each sentence is embedded into a vector, and we group consecutive sentences together as long as their semantic meaning (measured by cosine similarity) remains consistent. When a sentence's topic diverges, a new chunk is started. This creates chunks that are thematically unified and self-contained.

### 2. Maximal Marginal Relevance (MMR) Retrieval (`dashboard.js`)

When you ask a question, the system retrieves context using MMR.

-   **The Problem:** Basic semantic search often finds multiple chunks that are very similar to each other and the query. This is redundant and wastes valuable context space that could be used for more diverse information.
-   **The Solution:** We use **Maximal Marginal Relevance (MMR)**. This algorithm selects chunks by optimizing for two factors at once:
    1.  **Relevance**: How similar is the chunk to the user's question?
    2.  **Diversity**: How different is the chunk from the other chunks *already selected*?
-   This ensures the final context sent to the LLM is not just relevant but also comprehensive, providing a broader base of information to draw from for a high-quality answer.

---

## 💻 Technology & Core Concepts

-   **Platform**: Chrome Extension (Manifest V3)
-   **Core Logic**: JavaScript (ESM)
-   **LLM & Summarization**: [Groq API](https://groq.com/) (Llama 3)
-   **Text Embeddings**: [Hugging Face Inference API](https://huggingface.co/inference-api) (Sentence Transformers)
-   **RAG Components**: Semantic Chunking, Maximal Marginal Relevance (MMR)

---

## 📁 File Structure