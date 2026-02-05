/**
 * AI Chat Page
 * Natural language interface for querying business data
 */

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Code, Table as TableIcon, BarChart3 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '../types/chatbot';
import { streamChatQuery, getSuggestions } from '../services/chatbotApi';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Generate a unique session ID for conversation memory
const generateSessionId = () => `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

export default function AIChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sessionId] = useState(() => generateSessionId()); // Persist session ID across conversation
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load suggestions on mount
  useEffect(() => {
    getSuggestions().then((response) => {
      setSuggestions(response.suggestions);
    }).catch(console.error);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
      status: 'Processing...',
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const stream = streamChatQuery({ question: input, session_id: sessionId });

      for await (const event of stream) {
        if (event.type === 'status') {
          // Update status
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id
                ? { ...msg, status: event.message, sql: event.sql || msg.sql }
                : msg
            )
          );
        } else if (event.type === 'final') {
          // Final response
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id
                ? {
                  ...msg,
                  content: event.final_text,
                  sql: event.sql,
                  data: event.data,
                  row_count: event.row_count,
                  execution_time_ms: event.execution_time_ms,
                  chart: event.chart || null,
                  chart_data: event.chart_data || null,
                  query_type: event.query_type,
                  assumptions: event.assumptions,
                  isLoading: false,
                  status: undefined,
                }
                : msg
            )
          );
        } else if (event.type === 'error') {
          // Error occurred
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id
                ? {
                  ...msg,
                  content: `Error: ${event.message}`,
                  error: event.message,
                  suggestion: event.suggestion,
                  isLoading: false,
                  status: undefined,
                }
                : msg
            )
          );
        }
      }
    } catch (error) {
      console.error('Stream error:', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? {
              ...msg,
              content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              error: error instanceof Error ? error.message : 'Unknown error',
              isLoading: false,
              status: undefined,
            }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          AI Chat Assistant
        </h1>
        <p className="text-gray-400 mt-2">Ask questions about your business data in natural language</p>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-500 mb-6">
              <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Start by asking a question about your business data</p>
            </div>

            {/* Suggestions */}
            <div className="max-w-2xl mx-auto">
              <p className="text-sm text-gray-400 mb-3">Try these questions:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {suggestions.slice(0, 6).map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="text-left px-4 py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-sm text-gray-300 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your business data..."
          disabled={isLoading}
          className="flex-1 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Send
            </>
          )}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [showSQL, setShowSQL] = useState(false);
  const [showData, setShowData] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] px-4 py-3 bg-blue-600 text-white rounded-lg">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] px-6 py-4 bg-gray-800/50 border border-gray-700 rounded-lg">
        {message.isLoading ? (
          <div className="flex items-center gap-3 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{message.status}</span>
          </div>
        ) : message.error ? (
          <div>
            <div className="text-red-400 mb-2">{message.content}</div>
            {message.suggestion && (
              <div className="text-sm text-gray-400 italic">Suggestion: {message.suggestion}</div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Formatted Response */}
            <div className="prose prose-invert max-w-none">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>

            {/* Chart */}
            {message.chart && message.chart_data && (
              <div className="mt-4">
                <ChartRenderer config={message.chart} data={message.chart_data} />
              </div>
            )}

            {/* Expandable Sections */}
            <div className="space-y-2 mt-4 pt-4 border-t border-gray-700">
              {/* SQL */}
              {message.sql && (
                <div>
                  <button
                    onClick={() => setShowSQL(!showSQL)}
                    className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    <Code className="w-4 h-4" />
                    {showSQL ? 'Hide' : 'Show'} SQL Query
                  </button>
                  {showSQL && (
                    <pre className="mt-2 p-3 bg-gray-900 rounded text-sm overflow-x-auto">
                      <code className="text-green-400">{message.sql}</code>
                    </pre>
                  )}
                </div>
              )}

              {/* Data Table */}
              {message.data && message.data.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowData(!showData)}
                    className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    <TableIcon className="w-4 h-4" />
                    {showData ? 'Hide' : 'Show'} Raw Data ({message.row_count} rows)
                  </button>
                  {showData && (
                    <div className="mt-2 overflow-x-auto">
                      <DataTable data={message.data.slice(0, 10)} />
                      {message.data.length > 10 && (
                        <p className="text-xs text-gray-500 mt-2">
                          Showing first 10 of {message.row_count} rows
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Metadata */}
              {message.execution_time_ms && (
                <div className="text-xs text-gray-500">
                  Query executed in {message.execution_time_ms.toFixed(2)}ms
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChartRenderer({ config, data }: { config: any; data: any[] }) {
  const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

  // Chart data from backend already uses 'name' and 'value' keys
  // No need to look at x_axis/y_axis - those are just metadata

  if (config.type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="name" stroke="#9ca3af" />
          <YAxis stroke="#9ca3af" />
          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
          <Bar dataKey="value" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (config.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="name" stroke="#9ca3af" />
          <YAxis stroke="#9ca3af" />
          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
          <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (config.type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={80}
            label
          >
            {data.map((_entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return null;
}

function DataTable({ data }: { data: any[] }) {
  if (!data || data.length === 0) return null;

  const columns = Object.keys(data[0]);

  // Columns that should be formatted as currency (peso)
  const currencyColumns = ['revenue', 'total_revenue', 'sales', 'total_sales', 'amount', 'price', 'cost', 'profit', 'total', 'value'];
  // Columns that should be formatted as numbers with commas
  const numberColumns = ['quantity', 'total_quantity', 'total_quantity_sold', 'count', 'transaction_count', 'units', 'stock'];

  const formatCellValue = (value: any, columnName: string): string => {
    if (value === null || value === undefined) return '-';

    const colLower = columnName.toLowerCase();

    // Check if it's a currency column
    if (currencyColumns.some(c => colLower.includes(c))) {
      const num = typeof value === 'number' ? value : parseFloat(value);
      if (!isNaN(num)) {
        return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    }

    // Check if it's a number column that should have commas
    if (numberColumns.some(c => colLower.includes(c))) {
      const num = typeof value === 'number' ? value : parseFloat(value);
      if (!isNaN(num)) {
        return num.toLocaleString('en-PH');
      }
    }

    // For other numeric values, just add commas if it's a large number
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return value.toLocaleString('en-PH');
      }
      return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    return String(value);
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-900">
          <tr>
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 text-left text-gray-400 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="border-t border-gray-800">
              {columns.map((col) => (
                <td key={col} className="px-3 py-2 text-gray-300">
                  {formatCellValue(row[col], col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
