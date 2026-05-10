const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['book', 'read', 'bookreader'],
  usage: 'book [action] [title]\n\n📌 Available Actions:\n• search [title] - Search for books by title\n• read [bookId] - Read a book by its ID\n• info [title] - Get book information\n• popular - Get popular books\n• new - Get new/recent books',
  version: '1.0.0',
  author: 'AutoPageBot',
  category: 'search',
  cooldown: 3,

  async execute(senderId, args, pageAccessToken) {
    if (!args.length || args[0] === 'help') {
      return sendMessage(senderId, {
        text: this.usage
      }, pageAccessToken);
    }

    const action = args[0].toLowerCase();

    try {
      switch (action) {
        case 'search':
          await searchBook(senderId, args.slice(1), pageAccessToken);
          break;
        case 'read':
          await readBook(senderId, args.slice(1), pageAccessToken);
          break;
        case 'info':
          await bookInfo(senderId, args.slice(1), pageAccessToken);
          break;
        case 'popular':
          await popularBooks(senderId, pageAccessToken);
          break;
        case 'new':
          await newBooks(senderId, pageAccessToken);
          break;
        default:
          // If no action specified, treat as direct search
          await searchBook(senderId, args, pageAccessToken);
      }
    } catch (error) {
      console.error('Book Command Error:', error);
      await sendMessage(senderId, {
        text: '❌ An error occurred while processing your request. Please try again later.'
      }, pageAccessToken);
    }
  }
};

// Search for books by title
async function searchBook(senderId, args, pageAccessToken) {
  if (!args.length) {
    return sendMessage(senderId, {
      text: `❌ Please provide a book title to search!\n\n📝 Example: book search Harry Potter\n💡 Or simply: book Harry Potter`
    }, pageAccessToken);
  }

  const title = args.join(' ');
  
  await sendMessage(senderId, {
    text: `🔍 Searching for "${title}"...`
  }, pageAccessToken);

  try {
    // Using Open Library API (free, no API key required)
    const searchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=10`;
    const response = await axios.get(searchUrl, { timeout: 10000 });
    
    const books = response.data.docs;
    
    if (!books || books.length === 0) {
      return sendMessage(senderId, {
        text: `📖 No books found for "${title}".\n\n💡 Try a different title or check spelling.`
      }, pageAccessToken);
    }

    let resultText = `📚 Search Results for "${title}"\n━━━━━━━━━━━━━━━━━━\n📊 Found: ${books.length} book(s)\n\n`;
    
    books.slice(0, 10).forEach((book, index) => {
      const bookTitle = book.title || 'Unknown Title';
      const author = book.author_name ? book.author_name[0] : 'Unknown Author';
      const year = book.first_publish_year || 'N/A';
      const bookId = book.key ? book.key.replace('/works/', '') : null;
      
      resultText += `${index + 1}. 📖 ${bookTitle}\n`;
      resultText += `   ✍️ Author: ${author}\n`;
      resultText += `   📅 Published: ${year}\n`;
      if (bookId) {
        resultText += `   🆔 Book ID: ${bookId}\n`;
      }
      resultText += `\n`;
    });

    resultText += `💡 To read a book, use: book read [bookId]\n`;
    resultText += `📌 Example: book read OL27561817W\n`;
    resultText += `🔗 Source: Open Library`;

    await sendMessage(senderId, {
      text: resultText
    }, pageAccessToken);

  } catch (error) {
    console.error('Search Error:', error.message);
    await sendMessage(senderId, {
      text: `❌ Search failed. Please try again with a different title.`
    }, pageAccessToken);
  }
}

// Read a book by its ID
async function readBook(senderId, args, pageAccessToken) {
  if (!args.length) {
    return sendMessage(senderId, {
      text: `❌ Please provide a Book ID to read!\n\n📝 Example: book read OL27561817W\n\n💡 Get Book IDs from the search results.`
    }, pageAccessToken);
  }

  const bookId = args[0];
  
  await sendMessage(senderId, {
    text: `📖 Loading book content...\n🆔 ID: ${bookId}\n⏳ Please wait...`
  }, pageAccessToken);

  try {
    // Get book metadata
    const metaUrl = `https://openlibrary.org/works/${bookId}.json`;
    const metaResponse = await axios.get(metaUrl, { timeout: 10000 });
    const bookData = metaResponse.data;
    
    const title = bookData.title || 'Unknown Title';
    const authors = bookData.authors || [];
    
    // Try to get book content from various sources
    let content = await getBookContent(bookId, title);
    
    if (!content) {
      // Try alternative source
      content = await getGutenbergContent(title);
    }
    
    if (!content) {
      return sendMessage(senderId, {
        text: `📖 Book: ${title}\n━━━━━━━━━━━━━━━━━━\n⚠️ Full text not available for this book.\n\n📌 Available information:\n✍️ Author(s): ${authors.map(a => a.name || 'Unknown').join(', ')}\n📅 Published: ${bookData.first_publish_date || 'N/A'}\n📄 Pages: ${bookData.number_of_pages || 'N/A'}\n\n💡 Try searching for another book or check Project Gutenberg.`
      }, pageAccessToken);
    }
    
    // Split content into chunks (max 2000 chars per message)
    const chunks = splitIntoChunks(content, 1900);
    
    // Send first chunk with book info
    await sendMessage(senderId, {
      text: `📖 Now Reading: ${title}\n━━━━━━━━━━━━━━━━━━\n\n${chunks[0]}`
    }, pageAccessToken);
    
    // Send remaining chunks
    for (let i = 1; i < chunks.length; i++) {
      await sendMessage(senderId, {
        text: chunks[i]
      }, pageAccessToken);
    }
    
    if (chunks.length > 1) {
      await sendMessage(senderId, {
        text: `✅ End of available content for "${title}"\n\n💡 Use "book search" to find more books.`
      }, pageAccessToken);
    }

  } catch (error) {
    console.error('Read Book Error:', error.message);
    await sendMessage(senderId, {
      text: `❌ Failed to read book. The book ID may be invalid or content unavailable.\n\n💡 Try searching for the book first using "book search [title]"`
    }, pageAccessToken);
  }
}

// Get book information/details
async function bookInfo(senderId, args, pageAccessToken) {
  if (!args.length) {
    return sendMessage(senderId, {
      text: `❌ Please provide a book title!\n\n📝 Example: book info The Great Gatsby`
    }, pageAccessToken);
  }

  const title = args.join(' ');
  
  await sendMessage(senderId, {
    text: `🔍 Getting information about "${title}"...`
  }, pageAccessToken);

  try {
    const searchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`;
    const response = await axios.get(searchUrl, { timeout: 10000 });
    
    const book = response.data.docs?.[0];
    
    if (!book) {
      return sendMessage(senderId, {
        text: `❌ No information found for "${title}".`
      }, pageAccessToken);
    }
    
    const bookId = book.key?.replace('/works/', '');
    const detailUrl = `https://openlibrary.org/works/${bookId}.json`;
    let details = {};
    
    try {
      const detailResponse = await axios.get(detailUrl, { timeout: 10000 });
      details = detailResponse.data;
    } catch (e) {
      // Details not available
    }
    
    const infoText = `📚 Book Information\n━━━━━━━━━━━━━━━━━━\n📖 Title: ${book.title || 'N/A'}\n✍️ Author(s): ${book.author_name ? book.author_name.join(', ') : 'N/A'}\n📅 First Published: ${book.first_publish_year || 'N/A'}\n🔢 Edition Count: ${book.edition_count || 'N/A'}\n📊 Number of Pages: ${details.number_of_pages || 'N/A'}\n🌐 Language: ${book.language ? book.language.join(', ') : 'N/A'}\n📝 Subjects: ${book.subject ? book.subject.slice(0, 3).join(', ') : 'N/A'}\n\n🆔 Book ID: ${bookId || 'N/A'}\n\n💡 To read this book: book read ${bookId}\n🔗 Source: Open Library`;
    
    await sendMessage(senderId, {
      text: infoText
    }, pageAccessToken);
    
  } catch (error) {
    console.error('Book Info Error:', error.message);
    await sendMessage(senderId, {
      text: `❌ Failed to get book information. Please try again.`
    }, pageAccessToken);
  }
}

// Get popular books
async function popularBooks(senderId, pageAccessToken) {
  await sendMessage(senderId, {
    text: `🔥 Fetching popular books...`
  }, pageAccessToken);

  try {
    // Using Open Library's trending/subjects
    const subjects = ['love', 'adventure', 'science_fiction', 'mystery', 'fantasy'];
    const randomSubject = subjects[Math.floor(Math.random() * subjects.length)];
    
    const url = `https://openlibrary.org/subjects/${randomSubject}.json?limit=10`;
    const response = await axios.get(url, { timeout: 10000 });
    
    const books = response.data.works || [];
    
    let popularText = `🔥 Popular Books (${randomSubject.replace('_', ' ').toUpperCase()})\n━━━━━━━━━━━━━━━━━━\n\n`;
    
    books.slice(0, 10).forEach((book, index) => {
      const title = book.title || 'Unknown';
      const author = book.authors?.[0]?.name || 'Unknown Author';
      const bookId = book.key?.replace('/works/', '');
      
      popularText += `${index + 1}. 📖 ${title}\n`;
      popularText += `   ✍️ ${author}\n`;
      if (bookId) {
        popularText += `   🆔 ID: ${bookId}\n`;
      }
      popularText += `\n`;
    });
    
    popularText += `💡 To read a book: book read [bookId]\n📌 Example: book read OL27561817W`;
    
    await sendMessage(senderId, {
      text: popularText
    }, pageAccessToken);
    
  } catch (error) {
    console.error('Popular Books Error:', error.message);
    await sendMessage(senderId, {
      text: `📚 Here are some classic recommendations:\n\n1. Pride and Prejudice (ID: OL2019894W)\n2. 1984 (ID: OL1168083W)\n3. The Great Gatsby (ID: OL4782609W)\n4. To Kill a Mockingbird (ID: OL2645817W)\n5. Moby Dick (ID: OL91989W)\n\n💡 Use "book read [ID]" to read a book`
    }, pageAccessToken);
  }
}

// Get new/recent books
async function newBooks(senderId, pageAccessToken) {
  await sendMessage(senderId, {
    text: `🆕 Fetching recent books...`
  }, pageAccessToken);

  try {
    // Get recently published books
    const url = `https://openlibrary.org/recent.json?limit=10`;
    const response = await axios.get(url, { timeout: 10000 });
    
    const books = response.data.docs || [];
    
    let newText = `🆕 Recently Added Books\n━━━━━━━━━━━━━━━━━━\n\n`;
    
    books.slice(0, 10).forEach((book, index) => {
      const title = book.title || 'Unknown';
      const author = book.author_name?.[0] || 'Unknown Author';
      const year = book.first_publish_year || 'N/A';
      const bookId = book.key?.replace('/works/', '');
      
      newText += `${index + 1}. 📖 ${title}\n`;
      newText += `   ✍️ ${author}\n`;
      newText += `   📅 ${year}\n`;
      if (bookId) {
        newText += `   🆔 ID: ${bookId}\n`;
      }
      newText += `\n`;
    });
    
    newText += `💡 Use "book search [title]" to find specific books`;
    
    await sendMessage(senderId, {
      text: newText
    }, pageAccessToken);
    
  } catch (error) {
    console.error('New Books Error:', error.message);
    await sendMessage(senderId, {
      text: `🆕 Try searching for recent books using: book search [genre] 2024\n\nExamples:\n• book search romance 2024\n• book search science fiction 2024`
    }, pageAccessToken);
  }
}

// Helper: Get book content from various sources
async function getBookContent(bookId, title) {
  try {
    // Try Project Gutenberg API
    const gutenbergUrl = `https://gutendex.com/books/?search=${encodeURIComponent(title)}`;
    const gResponse = await axios.get(gutenbergUrl, { timeout: 10000 });
    
    const book = gResponse.data.results?.[0];
    if (book && book.formats && book.formats['text/plain']) {
      const textUrl = book.formats['text/plain'];
      const contentResponse = await axios.get(textUrl, { timeout: 30000 });
      let content = contentResponse.data;
      
      // Clean and limit content
      content = cleanText(content);
      return content.length > 5000 ? content.substring(0, 5000) + '...' : content;
    }
    
    // Try Open Library content
    const olUrl = `https://openlibrary.org/works/${bookId}/editions.json?limit=1`;
    const olResponse = await axios.get(olUrl, { timeout: 10000 });
    
    if (olResponse.data.entries?.[0]?.preview_url) {
      return `📖 Preview available at: ${olResponse.data.entries[0].preview_url}\n\nFull text may be available through your local library.`;
    }
    
    return null;
    
  } catch (error) {
    console.error('Get Book Content Error:', error.message);
    return null;
  }
}

// Helper: Alternative content source
async function getGutenbergContent(title) {
  try {
    const url = `https://gutendex.com/books/?search=${encodeURIComponent(title)}`;
    const response = await axios.get(url, { timeout: 10000 });
    
    const book = response.data.results?.[0];
    if (book && book.formats && book.formats['text/plain']) {
      const contentUrl = book.formats['text/plain'];
      const contentResponse = await axios.get(contentUrl, { timeout: 30000 });
      let content = contentResponse.data;
      content = cleanText(content);
      return content.length > 5000 ? content.substring(0, 5000) + '...' : content;
    }
    
    return null;
    
  } catch (error) {
    console.error('Gutenberg Error:', error.message);
    return null;
  }
}

// Helper: Split text into chunks
function splitIntoChunks(text, chunkSize) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.substring(i, i + chunkSize));
  }
  return chunks;
}

// Helper: Clean text content
function cleanText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/[^\x20-\x7E\n\x0A\x0D]/g, '') // Remove non-printable chars
    .substring(0, 6000);
}