
---

# Autonomous Social Media Content Factory 🤖📝

This project utilizes n8n's **AI Agent tool** to create a fully autonomous system that researches, generates, and publishes social media content. It goes beyond simple content generation by incorporating research, multi-platform publishing, and performance analysis, creating an end-to-end automated workflow based on a single topic prompt.

---

## 🛠️ Tech Stack

This project leverages a modern, full-stack architecture for the dashboard and orchestration layer, combined with powerful automation tools.

### **The MERN Stack (Next.js Edition)**

* **Frontend:** [Next.js](https://nextjs.org/) (React Framework) for a fast, SEO-friendly administrative dashboard.
* **Styling:** [Tailwind CSS](https://tailwindcss.com/) for a responsive, utility-first UI design.
* **Language:** [TypeScript](https://www.typescriptlang.org/) for type-safety and robust code maintainability.
* **Backend:** [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/) (via Next.js API routes) to handle agent triggers.
* **Database:** [MongoDB](https://www.mongodb.com/) to store content logs, performance metrics, and agent configurations.

### **Automation & AI**

* **Orchestration:** [n8n AI Agent Tool](https://n8n.io/) to manage the multi-agent workflow.
* **AI Models:** Integration with GPT-4o, Gemini, and DALL-E/Stability AI.

---

## ⚙️ Workflow and Agent Roles

The system is a multi-agent workflow orchestrated within the n8n platform. Each agent has a specialized role, ensuring a seamless and efficient process.

### Research Agent

The workflow is initiated by a new topic prompt. The **Research Agent** uses an **HTTP Request node** to access a web search tool or a dedicated research API. It scrapes websites and blogs to gather the latest trends, news, and relevant data, providing the foundational information for content creation.

### Content Creation Agent

Once the research is complete, the **Content Creation Agent** takes the structured data. It leverages a **Large Language Model (LLM) node**, such as GPT-4o or Gemini, to generate tailored content for different platforms. This includes:

* **Twitter:** Short, engaging posts with hashtags.
* **Instagram/Facebook:** Longer captions and ideas for visual assets.
* **LinkedIn:** Professional, detailed posts.
The agent can also utilize a **multimodal model node** (e.g., for DALL-E or Stability AI) to generate corresponding images or video scripts.

### Scheduling Agent

The **Scheduling Agent** receives the generated content and uses n8n's pre-built nodes to connect to a scheduling tool's API (like Buffer or Sprout Social). It intelligently schedules posts for the upcoming week, ensuring a balanced and consistent presence across all social media platforms.

### Performance Agent

After publication, the **Performance Agent** monitors the content's performance. It connects to analytics APIs (e.g., Google Analytics, social media insights) to collect data on engagement, reach, and other key metrics. This data is used to generate a summary report and, crucially, is fed back into the system's memory. This creates a feedback loop, allowing the Research Agent to learn what content performs best and improve future outputs.

---

## 🔧 Implementation Details

* **n8n AI Agent Tool:** This is the central component that orchestrates the entire workflow. Its drag-and-drop interface makes it easy to visualize and debug the complex interactions between agents and nodes.
* **Integrations:** n8n's extensive library allows for seamless connections to various services. This includes **Google Sheets** (for storing prompts), **Airtable** (for a content calendar), and a variety of social media APIs.
* **Memory:** The agents use a **Conversation Memory node** or connect to an external database like **PostgreSQL** or **MongoDB** to provide long-term memory, allowing them to learn from past successes and failures.

---

