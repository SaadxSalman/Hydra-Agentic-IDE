---
# Autonomous Social Media Content Factory 🤖📝

This project utilizes n8n's **AI Agent tool** to create a fully autonomous system that researches, generates, and publishes social media content. It goes beyond simple content generation by incorporating research, multi-platform publishing, and performance analysis, creating an end-to-end automated workflow based on a single topic prompt.

---

## ⚙️ Workflow and Agent Roles

The system is a multi-agent workflow orchestrated within the n8n platform. Each agent has a specialized role, ensuring a seamless and efficient process.

### Research Agent
The workflow is initiated by a new topic prompt. The **Research Agent** uses an **HTTP Request node** to access a web search tool or a dedicated research API. It scrapes websites and blogs to gather the latest trends, news, and relevant data, providing the foundational information for content creation.

### Content Creation Agent
Once the research is complete, the **Content Creation Agent** takes the structured data. It leverages a **Large Language Model (LLM) node**, such as GPT-4o or Gemini, to generate tailored content for different platforms. This includes:
- **Twitter:** Short, engaging posts with hashtags.
- **Instagram/Facebook:** Longer captions and ideas for visual assets.
- **LinkedIn:** Professional, detailed posts.
The agent can also utilize a **multimodal model node** (e.g., for DALL-E or Stability AI) to generate corresponding images or video scripts.

### Scheduling Agent
The **Scheduling Agent** receives the generated content and uses n8n's pre-built nodes to connect to a scheduling tool's API (like Buffer or Sprout Social). It intelligently schedules posts for the upcoming week, ensuring a balanced and consistent presence across all social media platforms.

### Performance Agent
After publication, the **Performance Agent** monitors the content's performance. It connects to analytics APIs (e.g., Google Analytics, social media insights) to collect data on engagement, reach, and other key metrics. This data is used to generate a summary report and, crucially, is fed back into the system's memory. This creates a feedback loop, allowing the Research Agent to learn what content performs best and improve future outputs.

---

## 🛠️ Technical Stack and Implementation

- **n8n AI Agent Tool:** This is the central component that orchestrates the entire workflow. Its drag-and-drop interface makes it easy to visualize and debug the complex interactions between agents and nodes.
- **AI Models:** The project integrates with leading LLMs and multimodal models through dedicated nodes, enabling powerful text and image generation capabilities.
- **Integrations:** n8n's extensive library of pre-built nodes allows for seamless connections to various services. This includes **Google Sheets** (for storing prompts), **Airtable** (for a content calendar), **WordPress** (for blog posts), and a variety of social media APIs (e.g., **Facebook Graph API**, **Twitter/X API**, and **LinkedIn API**).
- **Memory:** The agents can use a **Conversation Memory node** or connect to an external database like **PostgreSQL** to give them long-term memory, allowing them to learn from past successes and failures, a key feature for an autonomous system.

This project demonstrates the power of the n8n AI Agent tool by creating a sophisticated, end-to-end automation that handles a creative and complex task with minimal human intervention.
