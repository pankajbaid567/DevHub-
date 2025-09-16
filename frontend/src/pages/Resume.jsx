import React, { useMemo, useState } from 'react';
import { aiAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/Card';
import { 
  FileText, 
  Upload, 
  Eye, 
  Download, 
  Star, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  User,
  Briefcase,
  GraduationCap,
  Award,
  Target,
  TrendingUp,
  Zap,
  BookOpen,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  BarChart3,
  Brain
} from 'lucide-react';

const Resume = () => {
  const { user } = useAuth();
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeText, setResumeText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [aiReview, setAiReview] = useState('');
  const [isMockAI, setIsMockAI] = useState(false);
  const [modelUsed, setModelUsed] = useState('');
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [aiError, setAiError] = useState('');
  const [parsedReview, setParsedReview] = useState(null);

  // --- Helpers to parse AI text into structured sections ---
  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const normalizeAiText = (text) => {
    if (!text) return '';
    let t = String(text);
    // Normalize newlines
    t = t.replace(/\r\n?/g, '\n');
    // Remove markdown headings (## ### etc.) at line start
    t = t.replace(/(^|\n)\s*#{1,6}\s*/g, '$1');
    // Convert bullet characters to line bullets for easier parsing
    t = t.replace(/\s*[•]\s*/g, '\n- ');
    // Collapse excessive blank lines
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
  };

  const extractBullets = (block) => {
    // For paragraph-style content, split into sentences
    const sentences = block
      .replace(/\s+/g, ' ')
      .split(/\.\s+/)
      .map(s => s.trim())
      .filter(s => s && s.length > 10) // Filter out short fragments
      .map(s => s.endsWith('.') ? s : s + '.'); // Ensure sentences end with period
    
    // If we have clear bullet markers, use those
    const lines = block.split(/\n+/).map(l => l.trim()).filter(l => l);
    const hasBullets = lines.some(l => /^[-*•]\s+/.test(l) || /^\d+\.?\s+/.test(l));
    
    if (hasBullets) {
      return lines.flatMap(l => {
        // Handle nested bullets with ** bold markers
        const mBold = l.match(/^\*\s*\*\*([^*]+)\*\*\s*(.*)$/);
        if (mBold) return [`${mBold[1]}: ${mBold[2]}`.trim()];
        
        // Regular bullets
        const m = l.match(/^[-*•]\s+(.*)$/);
        const mNum = l.match(/^\d+\.?\s+(.*)$/);
        if (m) return [m[1].trim()];
        if (mNum) return [mNum[1].trim()];
        return [l];
      }).filter(Boolean);
    }
    
    // For paragraph content, return sentences as bullets
    return sentences.slice(0, 8); // Limit to prevent overwhelming UI
  };

  const sectionPatterns = useMemo(() => ([
    { key: 'strengths', patterns: ['strengths', 'project focus', 'technical skills', 'quantifiable achievements'] },
    { key: 'weaknesses', patterns: ['weaknesses', 'inconsistent formatting and structure', 'formatting and readability', 'chronological inconsistency'] },
    { key: 'suggestions', patterns: ['specific suggestions', 'recommendations', 'professional summary', 'expand experience section'] },
    { key: 'formatting', patterns: ['formatting tips', 'use a compliant font and size', 'clear section headings'] },
    { key: 'keywords', patterns: ['keyword optimization', 'keywords', 'based on the projects'] },
    { key: 'rating', patterns: ['overall rating', 'this resume demonstrates potential'] },
  ]), []);

  const findSectionRanges = (text) => {
    const ranges = [];
    const lines = text.split('\n');
    
    // Look for sentences that indicate different sections based on content
    let currentSection = null;
    let sectionStart = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase().trim();
      
      // Detect section changes based on content keywords
      let newSection = null;
      
      if (line.includes('excellent') || line.includes('quantifiable') || line.includes('strong project') || 
          line.includes('relevant skills') || line.includes('hackathon') || line.includes('gsoc')) {
        newSection = 'strengths';
      } else if (line.includes('formatting') || line.includes('readability') || line.includes('inconsistent') ||
                line.includes('unclear') || line.includes('missing') || line.includes('lacks') || 
                line.includes('detracts') || line.includes('unprofessional')) {
        newSection = 'weaknesses';
      } else if (line.includes('professional summary') || line.includes('expand') || line.includes('quantify') ||
                line.includes('revise') || line.includes('elaborate') || line.includes('add keywords')) {
        newSection = 'suggestions';
      } else if (line.includes('compliant font') || line.includes('section headings') || line.includes('bullet points') ||
                line.includes('white space') || line.includes('chronological order')) {
        newSection = 'formatting';
      } else if (line.includes('based on the projects') || line.includes('apis') || line.includes('testing') ||
                line.includes('cloud computing') || line.includes('ci/cd') || line.includes('version control')) {
        newSection = 'keywords';
      } else if (line.includes('overall rating') || line.includes('demonstrates potential') || 
                line.includes('/10') || line.includes('significant improvement')) {
        newSection = 'rating';
      }
      
      if (newSection && newSection !== currentSection) {
        // End previous section
        if (currentSection) {
          ranges.push({
            key: currentSection,
            start: sectionStart,
            end: text.split('\n').slice(0, i).join('\n').length,
            label: currentSection
          });
        }
        
        // Start new section
        currentSection = newSection;
        sectionStart = text.split('\n').slice(0, i).join('\n').length;
      }
    }
    
    // End the last section
    if (currentSection) {
      ranges.push({
        key: currentSection,
        start: sectionStart,
        end: text.length,
        label: currentSection
      });
    }
    
    return ranges;
  };

  const parseAiResumeReview = (text) => {
    if (!text || text.length < 20) return null;
    const normalized = normalizeAiText(text);
    const ranges = findSectionRanges(normalized);
    if (ranges.length === 0) return null;
    const result = { strengths: [], weaknesses: [], suggestions: [], formatting: [], keywords: [], rating: { score: null, text: '' } };
    ranges.forEach(({ key, start, end }) => {
      const raw = normalized.slice(start, end);
      // If heading uses inline form "Heading: content" keep content after first colon
      let body = '';
      const firstNewline = raw.indexOf('\n');
      const headerLine = firstNewline === -1 ? raw : raw.slice(0, firstNewline);
      const colonIdx = headerLine.indexOf(':');
      if (colonIdx !== -1) {
        body = raw.slice(raw.indexOf(':') + 1).trim();
      } else {
        // remove the first line as heading
        const lines = raw.split(/\n/);
        if (lines.length > 0) lines.shift();
        body = lines.join('\n').trim();
      }
      if (key === 'rating') {
        const scoreMatch = body.match(/(\b\d{1,2})\s*\/?\s*(10)\b/);
        result.rating.score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
        result.rating.text = body;
      } else if (key === 'keywords') {
        // Try to collect commas or bullets
        const bullets = extractBullets(body);
        const flat = bullets.join(', ');
        const items = flat.split(/,\s*/).map(s=>s.trim()).filter(Boolean);
        result.keywords = items;
      } else if (key === 'strengths') {
        result.strengths = extractBullets(body);
      } else if (key === 'weaknesses') {
        result.weaknesses = extractBullets(body);
      } else if (key === 'suggestions') {
        result.suggestions = extractBullets(body);
      } else if (key === 'formatting') {
        result.formatting = extractBullets(body);
      }
    });
    return result;
  };
  const [viewMode, setViewMode] = useState('upload'); // upload, analyze, results

  // Mock analysis data for demonstration
  const mockAnalysis = {
    overallScore: 78,
    scoreBreakdown: {
      format: 85,
      content: 75,
      keywords: 70,
      experience: 80,
      skills: 82,
      achievements: 65
    },
    strengths: [
      "Strong technical skills section with relevant technologies",
      "Clear work experience with quantifiable achievements", 
      "Good educational background and certifications",
      "Professional email and contact information"
    ],
    improvements: [
      "Add more quantifiable achievements with specific metrics",
      "Include relevant keywords for ATS optimization",
      "Improve summary section to highlight unique value proposition",
      "Add projects section to showcase practical experience",
      "Consider adding volunteer work or community involvement"
    ],
    atsCompatibility: {
      score: 72,
      issues: [
        "Tables and graphics may not parse correctly",
        "Missing standard section headers",
        "Some formatting may be lost during parsing"
      ],
      recommendations: [
        "Use standard section headers (Experience, Education, Skills)",
        "Avoid images, tables, and complex formatting",
        "Use simple bullet points for easy parsing"
      ]
    },
    keywordAnalysis: {
      missing: ["React", "Node.js", "API", "Database", "Agile", "CI/CD"],
      present: ["JavaScript", "Python", "Git", "Team Leadership"],
      suggestions: [
        "Add more technical keywords relevant to target role",
        "Include industry-specific terminology",
        "Mention relevant frameworks and tools"
      ]
    },
    industryInsights: {
      targetRole: "Full Stack Developer",
      salaryRange: "$75k - $120k",
      demandLevel: "High",
      competitiveAdvantage: "Strong in modern web technologies"
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setResumeFile(file);
      // In real app, you'd parse the PDF/DOC file here
      const reader = new FileReader();
      reader.onload = (e) => {
        // Mock text extraction - in real app use PDF parsing library
        setResumeText("Sample resume text extracted from file...");
      };
      reader.readAsText(file);
    }
  };

  const handleAnalyze = async () => {
    if (!resumeText && !resumeFile) return;

    setIsAnalyzing(true);
    setViewMode('analyze');

    try {
      const textToAnalyze = resumeText || 'Sample resume text extracted from file...';
      const { data } = await aiAPI.resumeReview({ resumeText: textToAnalyze });
  const reviewText = data?.review || '';
      const isMock = !!data?.isMockResponse;
      const model = data?.modelUsed || '';
      const usedFallback = !!data?.fallbackUsed;

      setModelUsed(model);
      setFallbackUsed(usedFallback);
      setIsMockAI(isMock);

      // Detect quota/unavailable errors and fallback to structured analysis for better UX
      const isQuotaOrUnavailable = /too many requests|quota|temporarily unavailable/i.test(reviewText);
      if (isMock && isQuotaOrUnavailable) {
        setAiError('AI quota reached or temporarily unavailable. Showing structured analysis instead.');
        setAnalysis(mockAnalysis);
        setAiReview('');
        setParsedReview(null);
      } else {
        setAiReview(reviewText);
        setAnalysis(null); // prefer AI review rendering when available
        const parsed = parseAiResumeReview(reviewText);
        setParsedReview(parsed);
      }
      setViewMode('results');
    } catch (error) {
      console.error('Analysis failed:', error);
      // Fallback to mock structured analysis to avoid blocking UX
      setAnalysis(mockAnalysis);
      setAiReview('');
      setIsMockAI(false);
      setAiError('Analysis failed. Showing structured analysis instead.');
  setParsedReview(null);
      setViewMode('results');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBg = (score) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (viewMode === 'analyze') {
    return (
      <div className="analyzing-container">
        <Card className="analyzing-card">
          <div className="mb-6">
            <div className="analyzing-spinner"></div>
            <h2 className="analyzing-title">
              Analyzing Your Resume
            </h2>
            <p className="analyzing-text">
              Our AI is reviewing your resume for content, formatting, ATS compatibility, and industry standards...
            </p>
          </div>
          
          <div className="analyzing-steps">
            <div className="analyzing-step">
              <CheckCircle className="step-icon step-complete" />
              Parsing document structure
            </div>
            <div className="analyzing-step">
              <CheckCircle className="step-icon step-complete" />
              Analyzing content quality
            </div>
            <div className="analyzing-step">
              <Clock className="step-icon step-current" />
              Checking ATS compatibility
            </div>
            <div className="analyzing-step">
              <Clock className="step-icon step-pending" />
              Generating recommendations
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (viewMode === 'results' && (aiReview || analysis)) {
    return (
      <div className="results-container">
        <div className="resume-container">
          {/* Header */}
          <div className="results-header">
            <div>
              <h1 className="resume-title">Resume Analysis</h1>
              <p className="resume-subtitle mt-2">
                Comprehensive AI-powered resume review and recommendations
              </p>
            </div>
            <div className="results-actions">
              <button onClick={() => { setViewMode('upload'); setAiReview(''); setAnalysis(null); }} className="btn btn-secondary">Analyze Another</button>
              <button className="btn btn-primary"><Download className="h-4 w-4 mr-2" />Export Report</button>
            </div>
          </div>

          {/* If AI review text is available, render it in a premium card */}
          {(aiError || aiReview) && (
            <div className="mb-8">
              {aiError && (
                <div className="success-banner" style={{ backgroundColor: 'rgba(234,179,8,0.10)', borderColor: 'rgba(234,179,8,0.35)' }}>
                  <div className="flex items-center">
                    <AlertTriangle className="h-5 w-5 text-orange-500 mr-2" />
                    <span className="text-slate-700 dark:text-slate-300">
                      {aiError}
                    </span>
                  </div>
                </div>
              )}

              {!aiError && isMockAI && (
                <div className="success-banner" style={{ backgroundColor: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.3)' }}>
                  <div className="flex items-center">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2" />
                    <span className="text-slate-700 dark:text-slate-300">
                      Using mock AI response. Set <code>GEMINI_API_KEY</code> in backend <code>.env</code> and restart the server for real Gemini analysis.
                    </span>
                  </div>
                </div>
              )}

              {/* If we parsed structured sections, render premium cards per section */}
              {parsedReview ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center">
                      <Brain className="h-5 w-5 text-primary-600 dark:text-primary-400 mr-2" />
                      AI Review
                    </h2>
                    {(modelUsed || fallbackUsed) && (
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {modelUsed ? `Model: ${modelUsed}` : 'Model: -'}{fallbackUsed ? ' (fallback)' : ''}
                      </span>
                    )}
                  </div>

                  {/* Strengths & Weaknesses */}
                  <div className="grid lg:grid-cols-2 gap-6">
                    <Card className="p-6">
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Strengths</h3>
                      <ul className="list-disc pl-5 space-y-1 text-slate-700 dark:text-slate-300">
                        {parsedReview.strengths?.length ? parsedReview.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        )) : <li>No strengths parsed.</li>}
                      </ul>
                    </Card>
                    <Card className="p-6">
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Weaknesses</h3>
                      <ul className="list-disc pl-5 space-y-1 text-slate-700 dark:text-slate-300">
                        {parsedReview.weaknesses?.length ? parsedReview.weaknesses.map((w, i) => (
                          <li key={i}>{w}</li>
                        )) : <li>No weaknesses parsed.</li>}
                      </ul>
                    </Card>
                  </div>

                  {/* Specific Suggestions */}
                  <Card className="p-6">
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Specific Suggestions</h3>
                    <ul className="list-disc pl-5 space-y-1 text-slate-700 dark:text-slate-300">
                      {parsedReview.suggestions?.length ? parsedReview.suggestions.map((w, i) => (
                        <li key={i}>{w}</li>
                      )) : <li>No suggestions parsed.</li>}
                    </ul>
                  </Card>

                  {/* Formatting Tips & Keywords */}
                  <div className="grid lg:grid-cols-2 gap-6">
                    <Card className="p-6">
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Formatting Tips</h3>
                      <ul className="list-disc pl-5 space-y-1 text-slate-700 dark:text-slate-300">
                        {parsedReview.formatting?.length ? parsedReview.formatting.map((w, i) => (
                          <li key={i}>{w}</li>
                        )) : <li>No formatting tips parsed.</li>}
                      </ul>
                    </Card>
                    <Card className="p-6">
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Keyword Optimization</h3>
                      {parsedReview.keywords?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {parsedReview.keywords.map((k,i)=>(
                            <span key={i} className="tag">{k}</span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-700 dark:text-slate-300">No keywords parsed.</p>
                      )}
                    </Card>
                  </div>

                  {/* Overall Rating */}
                  <Card className="p-6">
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Overall Rating</h3>
                    <div className="flex items-center gap-3">
                      {parsedReview.rating?.score != null && (
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">
                          {parsedReview.rating.score}/10
                        </div>
                      )}
                      <div className="text-slate-700 dark:text-slate-300">
                        {parsedReview.rating?.text}
                      </div>
                    </div>
                  </Card>
                </div>
              ) : (
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center">
                      <Brain className="h-5 w-5 text-primary-600 dark:text-primary-400 mr-2" />
                      AI Review
                    </h2>
                    {(modelUsed || fallbackUsed) && (
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {modelUsed ? `Model: ${modelUsed}` : 'Model: -'}{fallbackUsed ? ' (fallback)' : ''}
                      </span>
                    )}
                  </div>
                  {aiReview && (
                    <div className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {aiReview}
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}

          {/* Structured analysis fallback (demo) */}
          {analysis && (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Analysis */}
            <div className="lg:col-span-2 space-y-6">
              {/* Overall Score */}
              <Card className="score-card">
                <div className="score-header">
                  <h2 className="score-title">Overall Score</h2>
                  <div className="score-display">
                    <div className={`score-number ${getScoreColor(analysis.overallScore)}`}>
                      {analysis.overallScore}
                    </div>
                    <div className="score-out-of">/100</div>
                  </div>
                </div>
                
                <div className="score-bar">
                  <div 
                    className={`score-fill ${getScoreBg(analysis.overallScore)}`}
                    style={{ width: `${analysis.overallScore}%` }}
                  ></div>
                </div>

                {/* Score Breakdown */}
                <div className="score-breakdown">
                  {Object.entries(analysis.scoreBreakdown).map(([category, score]) => (
                    <div key={category} className="breakdown-item">
                      <span className="breakdown-category">
                        {category.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <div className="breakdown-score">
                        <div className={`breakdown-number ${getScoreColor(score)}`}>
                          {score}
                        </div>
                        <div className="breakdown-bar">
                          <div 
                            className={`score-fill ${getScoreBg(score)}`}
                            style={{ width: `${score}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Strengths */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  Strengths
                </h2>
                <div className="space-y-3">
                  {analysis.strengths.map((strength, index) => (
                    <div key={index} className="flex items-start">
                      <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                      <p className="text-slate-700 dark:text-slate-300">{strength}</p>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Improvements */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
                  <Target className="h-5 w-5 text-orange-500 mr-2" />
                  Areas for Improvement
                </h2>
                <div className="improvements-list">
                  {analysis.improvements.map((improvement, index) => (
                    <div key={index} className="improvement-item">
                      <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 mr-3 flex-shrink-0" />
                      <div>
                        <p className="text-slate-700 dark:text-slate-300 mb-2">{improvement}</p>
                        <button className="btn btn-link text-primary-600 dark:text-primary-400">
                          Get specific tips →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* ATS Compatibility */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center">
                    <BarChart3 className="h-5 w-5 text-blue-500 mr-2" />
                    ATS Compatibility
                  </h2>
                  <div className={`text-2xl font-bold ${getScoreColor(analysis.atsCompatibility.score)}`}>
                    {analysis.atsCompatibility.score}%
                  </div>
                </div>
                
                <div className="mb-4">
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${getScoreBg(analysis.atsCompatibility.score)}`}
                      style={{ width: `${analysis.atsCompatibility.score}%` }}
                    ></div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-slate-900 dark:text-white mb-2">Issues Found</h4>
                    <div className="space-y-1">
                      {analysis.atsCompatibility.issues.map((issue, index) => (
                        <div key={index} className="flex items-start text-sm">
                          <AlertTriangle className="h-3 w-3 text-red-500 mt-1 mr-2 flex-shrink-0" />
                          <span className="text-slate-600 dark:text-slate-400">{issue}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-slate-900 dark:text-white mb-2">Recommendations</h4>
                    <div className="space-y-1">
                      {analysis.atsCompatibility.recommendations.map((rec, index) => (
                        <div key={index} className="flex items-start text-sm">
                          <CheckCircle className="h-3 w-3 text-green-500 mt-1 mr-2 flex-shrink-0" />
                          <span className="text-slate-600 dark:text-slate-400">{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Industry Insights */}
              <Card className="p-6">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
                  <TrendingUp className="h-5 w-5 text-purple-500 mr-2" />
                  Industry Insights
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Target Role</label>
                    <p className="text-slate-900 dark:text-white">{analysis.industryInsights.targetRole}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Salary Range</label>
                    <p className="text-slate-900 dark:text-white">{analysis.industryInsights.salaryRange}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Market Demand</label>
                    <span className="tag tag--green">
                      {analysis.industryInsights.demandLevel}
                    </span>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Competitive Edge</label>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{analysis.industryInsights.competitiveAdvantage}</p>
                  </div>
                </div>
              </Card>

              {/* Keyword Analysis */}
              <Card className="p-6">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
                  <Brain className="h-5 w-5 text-indigo-500 mr-2" />
                  Keyword Analysis
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Missing Keywords</h4>
                    <div className="flex flex-wrap gap-1">
                      {analysis.keywordAnalysis.missing.map((keyword, index) => (
                        <span key={index} className="tag tag--red">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Present Keywords</h4>
                    <div className="flex flex-wrap gap-1">
                      {analysis.keywordAnalysis.present.map((keyword, index) => (
                        <span key={index} className="tag tag--green">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Quick Actions */}
              <Card className="p-6">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <button className="w-full flex items-center px-3 py-2 text-left text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Resume Writing Guide
                  </button>
                  <button className="w-full flex items-center px-3 py-2 text-left text-sm bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors">
                    <Zap className="h-4 w-4 mr-2" />
                    Optimize for ATS
                  </button>
                  <button className="w-full flex items-center px-3 py-2 text-left text-sm bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">
                    <Award className="h-4 w-4 mr-2" />
                    Industry Templates
                  </button>
                </div>
              </Card>
            </div>
          </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="resume-page">
      <div className="resume-container">
        {/* Header */}
        <div className="resume-header">
          <h1 className="resume-title">
            AI Resume Review
          </h1>
          <p className="resume-subtitle">
            Get comprehensive feedback on your resume from recruiters' perspective. 
            Our AI analyzes content, formatting, ATS compatibility, and provides actionable insights.
          </p>
        </div>

        {/* Upload Section */}
        <Card className="p-8 mb-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-primary-600 dark:text-primary-400" />
            </div>
            
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Upload Your Resume
            </h2>
            <p className="text-slate-600 dark:text-slate-300 mb-6">
              Support for PDF, DOC, DOCX files up to 5MB
            </p>
            
            {/* File Upload */}
            <div className="upload-area">
              <input
                type="file"
                id="resume-upload"
                accept=".pdf,.doc,.docx"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label 
                htmlFor="resume-upload" 
                className="cursor-pointer flex flex-col items-center"
              >
                <Upload className="upload-icon" />
                <span className="upload-text">
                  Click to upload or drag and drop
                </span>
                <span className="upload-subtext">
                  PDF, DOC, DOCX up to 5MB
                </span>
              </label>
            </div>

            {resumeFile && (
              <div className="success-banner">
                <div className="flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-green-700 dark:text-green-300 font-medium">
                    {resumeFile.name} uploaded successfully
                  </span>
                </div>
              </div>
            )}

            {/* OR Divider */}
            <div className="divider">
              <div className="text-center">
                <span className="divider-label">OR</span>
              </div>
            </div>

            {/* Text Input */}
            <div className="mb-6 text-left">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                Paste Resume Text
              </label>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your resume content here..."
                className="input textarea"
              />
            </div>

            {/* Analyze Button */}
            <button
              onClick={handleAnalyze}
              disabled={!resumeText && !resumeFile}
              className="btn btn-primary mx-auto flex"
            >
              <Brain className="h-5 w-5 mr-2" />
              Analyze Resume
            </button>
          </div>
        </Card>

        {/* Features */}
        <div className="feature-grid">
          <Card className="feature-card">
            <div className="feature-icon bg-blue-100 dark:bg-blue-900/20">
              <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="feature-title">ATS Score</h3>
            <p className="feature-description">
              Check how well your resume performs with Applicant Tracking Systems
            </p>
          </Card>
          
          <Card className="feature-card">
            <div className="feature-icon bg-green-100 dark:bg-green-900/20">
              <Target className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="feature-title">Content Review</h3>
            <p className="feature-description">
              Get detailed feedback on content quality and structure
            </p>
          </Card>
          
          <Card className="feature-card">
            <div className="feature-icon bg-purple-100 dark:bg-purple-900/20">
              <TrendingUp className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="feature-title">Industry Insights</h3>
            <p className="feature-description">
              Understand market trends and salary expectations for your role
            </p>
          </Card>
          
          <Card className="feature-card">
            <div className="feature-icon bg-orange-100 dark:bg-orange-900/20">
              <Zap className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <h3 className="feature-title">Quick Fixes</h3>
            <p className="feature-description">
              Get actionable recommendations for immediate improvements
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Resume;