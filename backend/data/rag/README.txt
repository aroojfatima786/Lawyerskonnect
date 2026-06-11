# Legal RAG runtime index (included in Docker image when present)
#
# Required files for full chatbot citations:
#   chunks_meta.json
#   embeddings.f32.bin
#   (optional) faiss.index
#
# Build locally: npm run setup:legal-rag  (needs law download/ PDFs)
# Without index: OpenAI answers still work; RAG retrieval is limited.
# See DEPLOY-PUBLIC.md
