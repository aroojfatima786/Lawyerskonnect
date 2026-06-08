import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole, VerificationStatus } from '../schemas/user.schema';
import { LegalKnowledge, LegalKnowledgeDocument } from '../schemas/legal-knowledge.schema';
import { LegalChatHistory, LegalChatHistoryDocument } from '../schemas/legal-chat-history.schema';
import { LegalKnowledgeService } from './legal-knowledge.service';
import { FaissSearchResult, LegalRagService } from './legal-rag.service';
import mammoth from 'mammoth';

type ChatBody = {
  message?: string;
  language?: 'english' | 'urdu' | 'roman_urdu';
  location?: string;
  latitude?: number;
  longitude?: number;
  preferredPracticeArea?: string;
  maxBudget?: number;
  caseText?: string;
};

type LawyerLocationContext = {
  city?: string;
  latitude?: number;
  longitude?: number;
};

type LawyerSearchPreferences = {
  maxBudget?: number;
  budgetSensitive?: boolean;
  prioritizeRating?: boolean;
};

type LegalSection = {
  title: string;
  actName?: string;
  sectionNumber?: string;
  source?: string;
  sourceUrl?: string;
  summary?: string;
};

export type LegalChatResponse = {
  answer: string;
  case_type: string;
  next_steps: string[];
  suggested_lawyers: Array<{
    _id: string;
    name: string;
    city: string;
    practiceAreas: string[];
    experienceYears?: number;
    rating?: number;
    consultationFee?: number;
    profileUrl: string;
    distanceKm?: number | null;
    nearby?: boolean;
    withinBudget?: boolean;
  }>;
  confidence: number;
  faq_used: boolean;
};

type FaqMatch = {
  matched: boolean;
  topic?: 'appointment' | 'fir' | 'legal_guidance' | 'app_use' | 'security' | 'safety_policy';
  caseType?: string;
  answer?: string;
};

const FAISS_WEAK_SCORE = 0.35;
const LOW_CONFIDENCE = 0.4;
const MAX_ANSWER_WORDS = 220;

type CitizenIntent = {
  id:
    | 'book_appointment'
    | 'cancel_reschedule'
    | 'payment_methods'
    | 'upload_documents'
    | 'lawyer_selection'
    | 'privacy_data'
    | 'account_security'
    | 'fraud_scam'
    | 'abusive_content'
    | 'illegal_activity';
  topic: 'app_use' | 'security' | 'safety_policy';
  patterns: RegExp[];
};

const CITIZEN_INTENTS: CitizenIntent[] = [
  {
    id: 'book_appointment',
    topic: 'app_use',
    patterns: [
      /how\s+to\s+book\s+appointment/i,
      /book\s+(a\s+)?consultation/i,
      /appointment\s+kaise\s+book/i,
      /lawyer\s+appointment\s+kaise/i,
    ],
  },
  {
    id: 'cancel_reschedule',
    topic: 'app_use',
    patterns: [/cancel\s+appointment/i, /reschedule/i, /appointment\s+change/i, /appointment\s+cancel\s+kaise/i],
  },
  {
    id: 'payment_methods',
    topic: 'app_use',
    patterns: [/payment\s+method/i, /how\s+to\s+pay/i, /fees?\s+kaise\s+pay/i, /jazzcash|easypaisa|stripe/i],
  },
  {
    id: 'upload_documents',
    topic: 'app_use',
    patterns: [/upload\s+document/i, /file\s+attach/i, /pdf\s+upload/i, /document\s+kaise\s+bhej/i],
  },
  {
    id: 'lawyer_selection',
    topic: 'app_use',
    patterns: [/which\s+lawyer/i, /best\s+lawyer/i, /lawyer\s+choose/i, /verified\s+lawyer/i],
  },
  {
    id: 'privacy_data',
    topic: 'security',
    patterns: [/data\s+privacy/i, /is\s+my\s+data\s+safe/i, /my\s+data/i, /information\s+secure/i],
  },
  {
    id: 'account_security',
    topic: 'security',
    patterns: [/account\s+hacked/i, /password\s+reset/i, /security\s+issue/i, /unauthorized\s+login/i],
  },
  {
    id: 'fraud_scam',
    topic: 'security',
    patterns: [/scam/i, /fraud/i, /fake\s+lawyer/i, /suspicious\s+payment/i],
  },
  {
    id: 'abusive_content',
    topic: 'safety_policy',
    patterns: [/abuse/i, /harass/i, /threat/i, /gali/i, /hate\s+speech/i],
  },
  {
    id: 'illegal_activity',
    topic: 'safety_policy',
    patterns: [/hack\s+someone/i, /fake\s+documents/i, /illegal\s+work/i, /fraud\s+karna/i],
  },
];

@Injectable()
export class AiLegalService {
  private readonly logger = new Logger(AiLegalService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(LegalKnowledge.name) private legalKnowledgeModel: Model<LegalKnowledgeDocument>,
    @InjectModel(LegalChatHistory.name) private legalChatHistoryModel: Model<LegalChatHistoryDocument>,
    private readonly legalKnowledgeService: LegalKnowledgeService,
    private readonly legalRagService: LegalRagService,
  ) {}

  async handleLegalChat(body: ChatBody, userId?: string, file?: Express.Multer.File): Promise<LegalChatResponse> {
    body = this.normalizeChatBody(body);
    if (file?.buffer) {
      if (file.size > 10 * 1024 * 1024) {
        throw new HttpException({ code: 'FILE_TOO_LARGE', message: 'File exceeds 10MB limit.' }, HttpStatus.BAD_REQUEST);
      }
      const lower = String(file.originalname || '').toLowerCase();
      if (/\.(png|jpg|jpeg|gif|webp)$/i.test(lower)) {
        throw new HttpException(
          {
            code: 'UNSUPPORTED_DOCUMENT_TYPE',
            message: 'Image OCR is not enabled yet. Please upload text PDF/DOC/TXT or type your question.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      body = { ...body, caseText: await this.extractDocumentText(file) };
    }
    return this.chat(body, userId);
  }

  async chat(body: ChatBody, userId?: string): Promise<LegalChatResponse> {
    const msg = String(body?.message || '').trim();
    const caseText = String(body?.caseText || '').trim();
    const question = msg || caseText;
    if (!question) throw new HttpException('message or caseText is required', HttpStatus.BAD_REQUEST);
    if (question.length > 10000) throw new HttpException('message is too long', HttpStatus.BAD_REQUEST);

    let language = this.normalizeLanguage(body.language);
    const searchQuery = `${msg}\n${caseText}`.trim();
    const inferredLanguage = this.detectMessageLanguage(searchQuery);
    if (inferredLanguage && language === 'english' && inferredLanguage !== 'english') {
      language = inferredLanguage;
    }

    // 1. Greeting (no retrieval, no classification)
    if (!caseText && this.isGreeting(msg)) {
      const response = this.buildGreetingResponse(language);
      if (userId) await this.saveHistory(userId, question, response, language, []);
      return response;
    }

    // 2. Small talk (no retrieval)
    if (!caseText && this.isSmallTalk(msg)) {
      const response = this.buildSmallTalkResponse(msg, language);
      if (userId) await this.saveHistory(userId, question, response, language, []);
      return response;
    }

    // 3. Citizen general dataset (app usage + security + safety)
    if (!caseText) {
      const citizenGeneral = await this.handleCitizenGeneralDataset(searchQuery, language, this.getLocationContext(body));
      if (citizenGeneral) {
        if (userId) await this.saveHistory(userId, question, citizenGeneral, language, []);
        return citizenGeneral;
      }
    }

    // 4. FAQ check (no LLM)
    const faq = this.handleFAQ(searchQuery, language);
    if (faq.matched && faq.answer) {
      const { explanation, steps } = this.splitExplanationAndSteps(faq.answer);
      const caseType = faq.caseType || '';
      const userAskedForLawyers = this.userWantsLawyerSuggestion(searchQuery);
      const { searchCtx, mentionCityInAnswer } = this.resolveGuidanceLocation(
        searchQuery,
        body,
        userAskedForLawyers,
      );
      const lawyerPrefs = this.resolveLawyerPreferences(body, searchQuery);
      const suggestedLawyers = userAskedForLawyers
        ? await this.searchVerifiedLawyersForCase(
            faq.topic === 'fir' ? 'Criminal Law' : faq.caseType || 'General Guidance',
            searchCtx,
            lawyerPrefs,
            {
              strictCategory: faq.topic === 'fir' || Boolean(faq.caseType),
              preferCity: Boolean(searchCtx.city && mentionCityInAnswer),
            },
          )
        : [];
      const response: LegalChatResponse = {
        answer: this.limitWords(explanation, MAX_ANSWER_WORDS, false),
        case_type: caseType,
        next_steps: steps.length ? steps : this.defaultNextSteps(caseType || 'General Guidance', language, userAskedForLawyers),
        suggested_lawyers: suggestedLawyers.slice(0, 3),
        confidence: 0.95,
        faq_used: true,
      };
      if (userId) await this.saveHistory(userId, question, response, language, []);
      return response;
    }

    // 4.5 Off-topic guard — legal guidance, lawyer suggestions, platform FAQ only
    if (this.shouldRefuseOffTopic(searchQuery, body.preferredPracticeArea)) {
      const response = this.buildOffTopicResponse(language);
      if (userId) await this.saveHistory(userId, question, response, language, []);
      return response;
    }

    // 5. Case classification
    const caseType = body.preferredPracticeArea || this.detectCategoryFromText(searchQuery);
    const userAskedForLawyers = this.userWantsLawyerSuggestion(searchQuery);
    const { searchCtx, llmCity, mentionCityInAnswer } = this.resolveGuidanceLocation(
      searchQuery,
      body,
      userAskedForLawyers,
    );
    const lawyerPrefs = this.resolveLawyerPreferences(body, searchQuery);
    const searchCategory = caseType === 'Other' ? 'General Guidance' : caseType;

    // 5.5 Direct lawyer suggestion — verified profiles only; no generic LLM checklist
    if (userAskedForLawyers && this.shouldUseDirectLawyerSuggestionPath(searchQuery, caseText)) {
      const suggestedLawyers = await this.searchVerifiedLawyersForCase(
        searchCategory,
        searchCtx,
        lawyerPrefs,
        {
          strictCategory: searchCategory !== 'General Guidance',
          preferCity: Boolean(searchCtx.city && mentionCityInAnswer),
        },
      );
      const response =
        suggestedLawyers.length > 0
          ? this.buildLawyerSuggestionResponse(language, searchCategory, suggestedLawyers, searchCtx, lawyerPrefs)
          : this.buildNoLawyersInCategoryResponse(language, searchCategory, searchCtx);
      if (userId) await this.saveHistory(userId, question, response, language, []);
      return response;
    }

    // 6. FAISS search (primary)
    const faissResults = this.legalRagService.searchSimilarDocs(searchQuery, 5);

    // 7. MongoDB fallback
    let mongoDocs: Awaited<ReturnType<LegalKnowledgeService['searchLegalKnowledge']>> = [];
    if (this.isFaissWeak(faissResults)) {
      mongoDocs = await this.legalKnowledgeService.searchLegalKnowledge(
        searchQuery,
        caseType !== 'Other' ? caseType : undefined,
        language,
        8,
      );
    }

    // 8. Merge context (internal only — never returned raw)
    const legalSections = this.mergeContext(faissResults, mongoDocs);
    const confidence = this.computeConfidence(faissResults, mongoDocs.length, false);

    // 9. Lawyer recommendations — only when the user explicitly asks (non-direct path)
    const suggestedLawyers = userAskedForLawyers
      ? await this.searchVerifiedLawyersForCase(searchCategory, searchCtx, lawyerPrefs, {
          strictCategory: searchCategory !== 'General Guidance',
          preferCity: Boolean(searchCtx.city && mentionCityInAnswer),
        })
      : [];

    if (userAskedForLawyers && !suggestedLawyers.length) {
      const response = this.buildNoLawyersInCategoryResponse(language, searchCategory, searchCtx);
      if (userId) await this.saveHistory(userId, question, response, language, []);
      return response;
    }

    // 10. LLM or limited mode
    const provider = this.resolveProvider();
    // If user uploads/attaches case text, allow a fuller GPT-style explanation by default.
    const allowLong = this.wantsDetailedExplanation(searchQuery) || !!caseText;
    let answer = '';
    let nextSteps: string[] = [];
    let usedAi = false;

    const humanContext = legalSections
      .map((s) => ({ citation: this.humanizeCitation(s), summary: this.sanitizePublicText(s.summary || '').slice(0, 300) }))
      .filter((c) => c.citation);

    if (provider === 'ollama') {
      try {
        const ai = await this.callLlm(
          'ollama',
          language,
          msg,
          caseText,
          body,
          humanContext,
          caseType,
          suggestedLawyers,
          allowLong,
          userAskedForLawyers,
          mentionCityInAnswer,
          llmCity,
        );
        if (ai.answer) {
          answer = ai.answer;
          nextSteps = Array.isArray(ai.nextSteps) ? ai.nextSteps.map(String) : [];
          usedAi = true;
        }
      } catch (err) {
        this.logger.warn(`Ollama failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (provider === 'openai') {
      try {
        const ai = await this.callLlm(
          'openai',
          language,
          msg,
          caseText,
          body,
          humanContext,
          caseType,
          suggestedLawyers,
          allowLong,
          userAskedForLawyers,
          mentionCityInAnswer,
          llmCity,
        );
        if (ai.answer) {
          answer = ai.answer;
          nextSteps = Array.isArray(ai.nextSteps) ? ai.nextSteps.map(String) : [];
          usedAi = true;
        }
      } catch (err) {
        this.logger.warn(`OpenAI failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!answer) {
      answer = this.buildLimitedAnswer(language, caseType);
      nextSteps = this.defaultNextSteps(caseType, language, userAskedForLawyers);
    }

    if (caseType !== 'Other' && this.shouldAttachCaseCategoryLabel(searchQuery, userAskedForLawyers)) {
      answer = this.ensureCategoryInAnswer(answer, caseType, language);
    }
    if (userAskedForLawyers && suggestedLawyers.length) {
      answer = this.ensureLawyerHintInAnswer(answer, language);
    }

    answer = this.stripPublicResponseLeakage(this.sanitizePublicText(answer));
    answer = this.stripUnrequestedCityMentions(answer, mentionCityInAnswer);
    answer = this.limitWords(answer, allowLong ? 450 : MAX_ANSWER_WORDS, allowLong);
    if (!nextSteps.length) nextSteps = this.defaultNextSteps(caseType, language, userAskedForLawyers);
    nextSteps = this.sanitizeNextStepsForLocation(nextSteps, mentionCityInAnswer, llmCity);

    const finalConfidence = this.computeConfidence(faissResults, mongoDocs.length, usedAi);

    const response: LegalChatResponse = {
      answer,
      case_type: caseType === 'Other' ? '' : caseType,
      next_steps: nextSteps
        .slice(0, 5)
        .map((s) => this.stripPublicResponseLeakage(this.sanitizePublicText(s))),
      suggested_lawyers: suggestedLawyers.slice(0, 3),
      confidence: finalConfidence,
      faq_used: false,
    };

    if (userId) await this.saveHistory(userId, question, response, language, mongoDocs);
    return response;
  }

  private isGreeting(message: string): boolean {
    const q = message.trim().toLowerCase().replace(/[!?.،]+/g, '').trim();
    if (!q || q.split(/\s+/).length > 6) return false;
    return /^(hello|hi|hey|hiya|salam|assalamualaikum|assalamu alaikum|aoa|asalam|good morning|good evening|good afternoon)(\s+\w+){0,2}$/.test(
      q,
    ) || /^(سلام|السلام علیکم|السلام عليكم)$/.test(q.trim());
  }

  private isSmallTalk(message: string): boolean {
    const q = message.trim().toLowerCase().replace(/[!?.،]+/g, '').trim();
    return /^(thanks|thank you|thankyou|shukriya|shukria|ok|okay|k|bye|goodbye|good bye|see you|khuda hafiz|allah hafiz|theek hai|thik hai)$/.test(
      q,
    );
  }

  private async handleCitizenGeneralDataset(
    query: string,
    language: 'english' | 'urdu' | 'roman_urdu',
    locationCtx?: LawyerLocationContext,
  ): Promise<LegalChatResponse | null> {
    const q = String(query || '').trim();
    if (!q) return null;
    const intent = CITIZEN_INTENTS.find((item) => item.patterns.some((p) => p.test(q)));
    if (!intent) return null;

    const { explanation, steps, caseType, recommendLawyers } = this.citizenIntentResponse(intent.id, language);
    const lawyerPrefs = this.resolveLawyerPreferences({} as ChatBody, q);
    const userAskedForLawyers = this.userWantsLawyerSuggestion(q);
    const suggestedLawyers =
      recommendLawyers && (userAskedForLawyers || intent.id === 'lawyer_selection')
        ? await this.searchVerifiedLawyersForCase(caseType || 'General Guidance', locationCtx, lawyerPrefs, {
            strictCategory: Boolean(caseType),
            preferCity: Boolean(locationCtx?.city),
          })
        : [];

    return {
      answer: this.limitWords(explanation, MAX_ANSWER_WORDS, false),
      case_type: caseType || '',
      next_steps: steps.slice(0, 5),
      suggested_lawyers: suggestedLawyers.slice(0, 3),
      confidence: 0.96,
      faq_used: true,
    };
  }

  private citizenIntentResponse(
    id: CitizenIntent['id'],
    language: 'english' | 'urdu' | 'roman_urdu',
  ): {
    explanation: string;
    steps: string[];
    caseType?: string;
    recommendLawyers: boolean;
  } {
    const en = {
      book_appointment: {
        explanation:
          'You can book a consultation from the lawyer profile page. Choose a verified lawyer, select an available time slot, and confirm your booking.',
        steps: [
          'Open Lawyers directory and select a verified lawyer.',
          'Check profile, practice area, fee, and available slots.',
          'Pick a slot and confirm booking.',
          'Complete payment if required.',
        ],
        caseType: 'General Guidance',
        recommendLawyers: false,
      },
      cancel_reschedule: {
        explanation:
          'You can manage your upcoming appointment from your dashboard. Use the appointment detail page to cancel or request reschedule.',
        steps: [
          'Go to your appointments section.',
          'Open the appointment you want to change.',
          'Use cancel or reschedule option.',
          'Check updated status in your dashboard.',
        ],
        caseType: '',
        recommendLawyers: false,
      },
      payment_methods: {
        explanation:
          'Supported payment options depend on active provider configuration. Follow checkout instructions shown at booking time.',
        steps: [
          'Book a consultation slot first.',
          'On checkout, select available payment option.',
          'Complete payment and keep confirmation.',
          'If payment fails, retry or use another supported method.',
        ],
        caseType: '',
        recommendLawyers: false,
      },
      upload_documents: {
        explanation:
          'You can upload legal documents from the guidance chat attachment button. The system currently supports text-based files.',
        steps: [
          'Use the attachment icon in legal guidance chat.',
          'Upload TXT, PDF, DOC, or DOCX file.',
          'Add a short question with context.',
          'Submit for AI guidance review.',
        ],
        caseType: 'General Guidance',
        recommendLawyers: false,
      },
      lawyer_selection: {
        explanation:
          'Choose a lawyer based on your case type, rating, experience, city, and fee. Prefer verified profiles with relevant practice areas.',
        steps: [
          'Identify your case type first (family, criminal, property, etc.).',
          'Shortlist verified lawyers with matching practice area.',
          'Compare rating, experience, and consultation fee.',
          'Book the lawyer that best matches your needs.',
        ],
        caseType: 'General Guidance',
        recommendLawyers: true,
      },
      privacy_data: {
        explanation:
          'Your account and case data are intended to be used only for platform services. Avoid sharing unnecessary sensitive details in chat.',
        steps: [
          'Share only relevant case information.',
          'Do not post passwords, CNIC photos, or bank PINs in chat.',
          'Use your account dashboard to manage activity securely.',
        ],
        caseType: '',
        recommendLawyers: false,
      },
      account_security: {
        explanation:
          'If you suspect unauthorized account access, secure your account immediately and contact support.',
        steps: [
          'Change your password immediately.',
          'Log out from other devices if available.',
          'Review recent account activity.',
          'Contact platform support with details.',
        ],
        caseType: '',
        recommendLawyers: false,
      },
      fraud_scam: {
        explanation:
          'If you suspect scam or fake lawyer activity, do not proceed with payment and report the profile through official support channels.',
        steps: [
          'Do not share OTP, passwords, or card PIN.',
          'Do not send payment outside official app flow.',
          'Capture profile details/screenshots.',
          'Report the issue to support/admin immediately.',
        ],
        caseType: '',
        recommendLawyers: false,
      },
      abusive_content: {
        explanation:
          'We cannot assist with abusive, threatening, or harmful communication. Please keep your query respectful and legal.',
        steps: [
          'Rephrase your question respectfully.',
          'Focus on lawful guidance only.',
          'If someone is threatening you, contact relevant authorities.',
        ],
        caseType: '',
        recommendLawyers: false,
      },
      illegal_activity: {
        explanation:
          'I cannot help with illegal actions, fraud, hacking, or creating fake documents. I can only provide lawful guidance.',
        steps: [
          'Ask a legal and lawful question.',
          'Share your issue for compliant legal guidance.',
          'Consult a verified lawyer for legitimate options.',
        ],
        caseType: '',
        recommendLawyers: false,
      },
    } as const;

    const urdu = {
      ...en,
      book_appointment: {
        ...en.book_appointment,
        explanation:
          'آپ lawyer profile سے consultation book کر سکتے ہیں۔ verified lawyer منتخب کریں، available slot choose کریں، پھر booking confirm کریں۔',
      },
      illegal_activity: {
        ...en.illegal_activity,
        explanation:
          'میں غیر قانونی کام، fraud، hacking یا fake documents میں مدد نہیں کر سکتا۔ میں صرف قانونی رہنمائی فراہم کر سکتا ہوں۔',
      },
    } as const;

    const roman = {
      ...en,
      book_appointment: {
        ...en.book_appointment,
        explanation:
          'Aap lawyer profile se consultation book kar sakte hain. Verified lawyer select karein, available slot choose karein, phir booking confirm karein.',
      },
      illegal_activity: {
        ...en.illegal_activity,
        explanation:
          'Main illegal kaam, fraud, hacking ya fake documents mein madad nahi kar sakta. Main sirf lawful legal guidance de sakta hoon.',
      },
    } as const;

    const source = language === 'urdu' ? urdu : language === 'roman_urdu' ? roman : en;
    const selected = source[id];
    return {
      explanation: selected.explanation,
      steps: [...selected.steps],
      caseType: selected.caseType,
      recommendLawyers: selected.recommendLawyers,
    };
  }

  private buildGreetingResponse(language: 'english' | 'urdu' | 'roman_urdu'): LegalChatResponse {
    let answer: string;
    if (language === 'urdu') {
      answer =
        'سلام! میں LawyersKonnect کا Legal Guidance assistant ہوں۔ اپنا قانونی مسئلہ سادہ الفاظ میں بیان کریں — جیسے property، family، criminal یا rent — اور میں عمومی رہنمائی اور verified lawyers کی تجویز دوں گا۔';
    } else if (language === 'roman_urdu') {
      answer =
        'Salam! Main LawyersKonnect ka Legal Guidance assistant hoon. Apna legal masla simple alfaaz mein batayein — jaise property, family, criminal ya rent — aur main general guidance aur verified lawyers suggest karunga.';
    } else {
      answer =
        "Hello! I'm your Legal Guidance assistant on LawyersKonnect. Tell me about your legal issue in plain language — for example property, family, criminal, or rent — and I'll share general guidance and suggest verified lawyers.";
    }
    return {
      answer,
      case_type: '',
      next_steps: [],
      suggested_lawyers: [],
      confidence: 1,
      faq_used: false,
    };
  }

  private buildSmallTalkResponse(message: string, language: 'english' | 'urdu' | 'roman_urdu'): LegalChatResponse {
    const q = message.trim().toLowerCase();
    let answer: string;
    if (/thank|shukri/.test(q)) {
      answer =
        language === 'urdu'
          ? 'خوش آمدید! اگر مزید قانونی رہنمائی چاہیے تو بلا جھجھک پوچھیں۔'
          : language === 'roman_urdu'
            ? "You're welcome! Agar mazeed legal guidance chahiye to pooch sakte hain."
            : "You're welcome! Feel free to ask if you need more legal guidance.";
    } else if (/bye|hafiz|see you/.test(q)) {
      answer =
        language === 'urdu'
          ? 'اللہ حافظ! جب بھی قانونی مدد درکار ہو، دوبارہ آئیں۔'
          : language === 'roman_urdu'
            ? 'Khuda hafiz! Jab bhi legal help chahiye ho, wapas aa sakte hain.'
            : 'Goodbye! Come back anytime you need legal guidance.';
    } else {
      answer =
        language === 'urdu'
          ? 'ٹھیک ہے۔ جب آپ تیار ہوں، اپنا قانونی سوال یہاں لکھ دیں۔'
          : language === 'roman_urdu'
            ? 'Theek hai. Jab aap ready hon, apna legal sawal yahan likh dein.'
            : 'Got it. Whenever you are ready, share your legal question here.';
    }
    return {
      answer,
      case_type: '',
      next_steps: [],
      suggested_lawyers: [],
      confidence: 1,
      faq_used: false,
    };
  }

  /** True when the query is clearly about law, lawyers, or this platform — not school/general topics. */
  private isClearlyLegalTopic(text: string, preferredPracticeArea?: string): boolean {
    const combined = String(text || '').trim();
    if (!combined) return false;
    if (String(preferredPracticeArea || '').trim()) return true;
    if (this.detectCategoryFromText(combined) !== 'Other') return true;
    if (CITIZEN_INTENTS.some((item) => item.patterns.some((p) => p.test(combined)))) return true;
    if (this.userWantsCategoryOrLawyerSuggestion(combined)) return true;
    return /(?:\blegal\b|\blawyer\b|\blaw\b|qanuni|قانون|وکیل|عدالت|\bcourt\b|\bfir\b|mukadma|مقدمہ|complaint|rights|haqooq|حقوق|lawyerskonnect|consultation|appointment|verified\s+lawyer|wakil|vakeel|police\s+report|contract\s+act|constitution|bail|rent\s+dispute|tenant|landlord|divorce|custody|property\s+dispute|employment\s+termination|cheque\s+bounce|consumer\s+complaint)/i.test(
      combined,
    );
  }

  private isOffTopicAcademicOrGeneral(text: string): boolean {
    const t = String(text || '').toLowerCase();
    const patterns: RegExp[] = [
      /operation\s+research|operations\s+research|\bor\b\s*(?:subject|course|method)|dual\s+method|simplex\s+method|linear\s+programming|transportation\s+problem|assignment\s+problem/i,
      /\b(?:math|mathematics|calculus|algebra|geometry|trigonometry|statistics|probability|physics|chemistry|biology)\b/i,
      /(?:homework|assignment|coursework|exam\s+prep|midterm|final\s+exam|semester|university\s+subject|college\s+subject|class\s+\d+\s+subject)/i,
      /(?:programming|python|javascript|java|c\+\+|react|sql)\s+(?:homework|assignment|tutorial|code\s+help|project\s+help)/i,
      /(?:recipe|cook(?:ing)?|cricket\s+score|football\s+match|weather\s+forecast|movie\s+recommend|song\s+lyrics|tell\s+me\s+a\s+joke)/i,
      /(?:who\s+won|capital\s+of\s+(?!pakistan\b)|translate\s+this\s+(?:sentence|paragraph|text))/i,
      /(?:gpt|chatgpt|openai|google)\s+(?:se|say|se\s+puch|ka\s+jawab)/i,
    ];
    return patterns.some((p) => p.test(t));
  }

  private looksLikeGeneralTutoringRequest(text: string): boolean {
    const t = String(text || '').toLowerCase();
    const tutoringPhrasing =
      /(?:smjh|samjh|explain|sikh|sikha|solve|solve\s+karo|kaise\s+kare|kese\s+kare|kya\s+hai|nhi\s+at|nahi\s+aat|nahi\s+samajh|help\s+with\s+my|yeh\s+topic|ye\s+topic)/i;
    const subjectHint =
      /(?:subject|topic|chapter|unit|lecture|course|class|paper|question\s+no|dual\s+method|operation\s+research)/i;
    if (!tutoringPhrasing.test(t) || !subjectHint.test(t)) return false;
    return !this.isClearlyLegalTopic(t);
  }

  private shouldRefuseOffTopic(text: string, preferredPracticeArea?: string): boolean {
    const combined = String(text || '').trim();
    if (!combined) return false;
    if (this.isClearlyLegalTopic(combined, preferredPracticeArea)) return false;
    return this.isOffTopicAcademicOrGeneral(combined) || this.looksLikeGeneralTutoringRequest(combined);
  }

  private buildOffTopicResponse(language: 'english' | 'urdu' | 'roman_urdu'): LegalChatResponse {
    let answer: string;
    let nextSteps: string[];
    if (language === 'urdu') {
      answer =
        'میں LawyersKonnect کا Legal Guidance assistant ہوں — میں صرف پاکستانی قانونی مسائل، lawyer suggestions، اور اس platform کے استعمال میں مدد کرتا ہوں۔ School subjects، homework، programming tutorials، یا دیگر غیر-قانونی سوالات کا جواب نہیں دے سکتا۔ براہ کرم اپنا legal masla بیان کریں (مثلاً rent، property، family، criminal، employment)۔';
      nextSteps = [
        'اپنا قانونی مسئلہ سادہ الفاظ میں بیان کریں',
        'اگر معلوم ہو تو category بتائیں (property، family، criminal وغیرہ)',
        'Verified lawyer سے consultation book کریں',
      ];
    } else if (language === 'roman_urdu') {
      answer =
        'Main LawyersKonnect ka Legal Guidance assistant hoon — main sirf Pakistani legal masail, lawyer suggestions, aur is app ke istemal mein madad karta hoon. School subjects, homework, programming tutorials, ya doosre non-legal sawaal ka jawab nahi de sakta. Barah-e-karam apna legal masla batayein — jaise rent, property, family, criminal, ya job dispute.';
      nextSteps = [
        'Apna legal masla simple alfaaz mein batayein',
        'Agar pata ho to category batayein (property, family, criminal, etc.)',
        'Verified lawyer se consultation book karein',
      ];
    } else {
      answer =
        "I'm the Legal Guidance assistant on LawyersKonnect — I only help with Pakistani legal issues, lawyer suggestions, and using this platform. I can't answer school subjects, homework, programming tutorials, or other non-legal questions. Please describe your legal issue (e.g. rent, property, family, criminal, or employment).";
      nextSteps = [
        'Describe your legal issue in plain language',
        'Mention the category if you know it (property, family, criminal, etc.)',
        'Book a verified lawyer for personal advice on LawyersKonnect',
      ];
    }
    return {
      answer,
      case_type: '',
      next_steps: nextSteps,
      suggested_lawyers: [],
      confidence: 1,
      faq_used: false,
    };
  }

  private buildClarificationResponse(language: 'english' | 'urdu' | 'roman_urdu'): LegalChatResponse {
    let answer: string;
    if (language === 'urdu') {
      answer =
        'آپ کے سوال کی مکمل سمجھ کے لیے thodi mazeed detail درکار ہے۔ براہ کرم بتائیں: مسئلہ کیا ہے، کب ہوا، اور آپ کیا outcome چاہتے ہیں؟';
    } else if (language === 'roman_urdu') {
      answer =
        'Aap ke sawal ki behtar samajh ke liye thori aur detail chahiye. Barah-e-karam batayein: masla kya hai, kab hua, aur aap kya outcome chahte hain?';
    } else {
      answer =
        'Can you provide more details about your legal issue? It would help to know what happened, when it occurred, and what outcome you are hoping for.';
    }
    return {
      answer,
      case_type: '',
      next_steps: [
        language === 'urdu'
          ? 'مسئلے کی مختصر timeline لکھیں'
          : language === 'roman_urdu'
            ? 'Maslay ki short timeline likhein'
            : 'Share a brief timeline of events',
        language === 'urdu'
          ? 'متعلقہ documents کا ذکر کریں'
          : language === 'roman_urdu'
            ? 'Mutaalliq documents ka zikar karein'
            : 'Mention any relevant documents',
      ],
      suggested_lawyers: [],
      confidence: 0.2,
      faq_used: false,
    };
  }

  private wantsDetailedExplanation(text: string): boolean {
    return /detailed|detail|in depth|full explanation|explain thoroughly|تفصیل|مکمل وضاحت|tafseel|mukammal/i.test(text);
  }

  private limitWords(text: string, maxWords: number, allowLong: boolean): string {
    if (allowLong) return text.trim();
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return text.trim();
    return `${words.slice(0, maxWords).join(' ')}…`;
  }

  private splitExplanationAndSteps(raw: string): { explanation: string; steps: string[] } {
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const steps: string[] = [];
    const prose: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (/^\d+[\).:\-–—]\s+/.test(t)) {
        steps.push(t.replace(/^\d+[\).:\-–—]\s+/, '').trim());
      } else if (t) {
        prose.push(t.endsWith(':') ? t.slice(0, -1) : t);
      }
    }
    return { explanation: prose.join(' ').trim(), steps };
  }

  private defaultNextSteps(
    caseType: string,
    language: 'english' | 'urdu' | 'roman_urdu',
    userAskedForLawyers = false,
  ): string[] {
    if (language === 'urdu') {
      return userAskedForLawyers
        ? [
            'تمام متعلقہ documents اور timeline تیار کریں',
            'Verified lawyer سے consultation book کریں',
            'Case-specific advice کے لیے professional legal counsel لیں',
          ]
        : [
            'تمام متعلقہ documents اور timeline تیار کریں',
            'اپنے مسئلے کی مختصر تفصیل محفوظ رکھیں',
            'جب چاہیں تو verified lawyers suggest karne ko poochein',
          ];
    }
    if (language === 'roman_urdu') {
      return userAskedForLawyers
        ? [
            'Tamam documents aur timeline tayar karein',
            'Verified lawyer se consultation book karein',
            'Case-specific advice ke liye professional lawyer se mashwara karein',
          ]
        : [
            'Tamam documents aur timeline tayar karein',
            'Apne maslay ki short summary likh kar rakhein',
            'Jab chahein to lawyer suggest karne ko poochein',
          ];
    }
    return userAskedForLawyers
      ? [
          'Gather relevant documents and a timeline of events',
          `Consider consulting a verified ${caseType !== 'Other' ? caseType.toLowerCase() : 'lawyer'}`,
          'Book a consultation for case-specific advice on LawyersKonnect',
        ]
      : [
          'Gather relevant documents and a timeline of events',
          'Note the key facts of your issue for future reference',
          'Ask me to suggest verified lawyers when you are ready to book',
        ];
  }

  private isInternalRef(value: string): boolean {
    const v = String(value || '').trim();
    if (!v) return true;
    return (
      /^administrator/i.test(v) ||
      /\.(pdf|docx?|txt)$/i.test(v) ||
      /::chunk-/i.test(v) ||
      /^[a-f0-9]{12,}$/i.test(v) ||
      /^\d{4}\.pdf$/i.test(v)
    );
  }

  private sanitizePublicText(text: string): string {
    return String(text || '')
      .replace(/\badministrator[a-f0-9]+\.pdf\b/gi, '')
      .replace(/\b[a-f0-9]{20,}(?:\.pdf)?\b/gi, '')
      .replace(/::chunk-\d+/gi, '')
      .replace(/\b[\w./\\-]+\.(pdf|docx?|txt)\b/gi, '')
      .replace(/\bchunk-\d+\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /** Remove wording that exposes RAG / references or boilerplate phrases citizens should not see. */
  private stripPublicResponseLeakage(text: string): string {
    let out = String(text || '');
    const sentencePatterns: RegExp[] = [
      /[^.!?\n]*\b(?:provided|given|your|the)\s+legal\s+references?\b[^.!?\n]*[.!?]?/gi,
      /[^.!?\n]*\b(?:provided|given)\s+references?\b[^.!?\n]*[.!?]?/gi,
      /[^.!?\n]*\breferences?\s+(?:are|were|is)\s+(?:insufficient|not\s+(?:found|available|helpful))[^.!?\n]*[.!?]?/gi,
      /[^.!?\n]*\b(?:not|wasn't|isn't)\s+(?:found|available|mentioned)\s+in\s+(?:the\s+)?references?[^.!?\n]*[.!?]?/gi,
      /[^.!?\n]*\bcould\s+not\s+find\s+(?:a\s+)?(?:verified\s+)?(?:legal\s+)?references?[^.!?\n]*[.!?]?/gi,
      /[^.!?\n]*\baccording\s+to\s+(?:the\s+)?(?:provided\s+)?references?[^.!?\n]*[.!?]?/gi,
      /[^.!?\n]*\bverified\s+legal\s+reference\s+nahi\s+mila[^.!?\n]*[.!?]?/gi,
      /[^.!?\n]*\b(?:qanuni\s+)?hawala\s+nahi\s+mila[^.!?\n]*[.!?]?/gi,
      /[^.!?\n]*\bpakistanLawContext\b[^.!?\n]*[.!?]?/gi,
      /[^.!?\n]*\blegalReferences\b[^.!?\n]*[.!?]?/gi,
      /[^.!?\n]*\bgeneral\s+legal\s+(?:information|info|guidance)\b[^.!?\n]*[.!?]?/gi,
      /[^.!?\n]*\bfor\s+general\s+(?:legal\s+)?(?:information|informational)\s+purposes\b[^.!?\n]*[.!?]?/gi,
      /[^.!?\n]*\bthis\s+is\s+(?:only\s+)?general\s+legal\b[^.!?\n]*[.!?]?/gi,
    ];
    for (const pat of sentencePatterns) {
      out = out.replace(pat, ' ');
    }
    out = out
      .replace(/\bthe\s+reference\s+you\s+(?:provided|gave|shared)\b/gi, '')
      .replace(/\b(?:your|the)\s+reference\s+(?:does|did)\s+not\b/gi, '')
      .replace(/\bno\s+verified\s+legal\s+reference\b/gi, '')
      .replace(/\(?\s*general\s+legal\s+(?:information|info|guidance)\s*(?:only)?\s*\)?/gi, '')
      .replace(/\bgeneral\s+legal\s+(?:information|info|guidance)\b/gi, '')
      .replace(/\bfor\s+general\s+informational\s+purposes\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return out || text;
  }

  private humanizeCitation(section: LegalSection): string {
    const summary = section.summary || '';
    const title = this.sanitizePublicText(section.title || '');
    const act = this.sanitizePublicText(section.actName || '');
    const sec = section.sectionNumber?.trim();

    const articleInText =
      summary.match(/Article\s+(\d+[A-Za-z]?)\s*[-–—:]\s*([^\n.]{4,80})/i) ||
      title.match(/Article\s+(\d+[A-Za-z]?)\s*[-–—:]\s*(.+)/i);
    if (articleInText) {
      const label = `Article ${articleInText[1]}`;
      const name = articleInText[2]?.trim();
      return name && !this.isInternalRef(name) ? `${label} — ${name}` : label;
    }

    if (sec) {
      const heading = this.extractHeadingFromSummary(summary);
      if (heading) return `Section ${sec} — ${heading}`;
      if (act && !this.isInternalRef(act)) return `Section ${sec} — ${act}`;
      return `Section ${sec}`;
    }

    if (act && !this.isInternalRef(act)) return act;
    if (title && !this.isInternalRef(title)) return title;

    const actMatch = summary.match(/THE\s+[A-Z0-9][^.]{8,120}\bACT\b[^.]*/i);
    if (actMatch) return this.sanitizePublicText(actMatch[0]);

    return '';
  }

  private extractHeadingFromSummary(summary: string): string {
    const m = summary.match(/(?:^|\n)\s*(\d+[A-Za-z]?)\.\s+([^\n.]{4,80})/);
    return m ? this.sanitizePublicText(m[2]) : '';
  }

  /** Built-in FAQ — no separate module; matched queries skip LLM. */
  private handleFAQ(query: string, language: 'english' | 'urdu' | 'roman_urdu'): FaqMatch {
    const q = String(query || '').toLowerCase();

    const appointmentPatterns = [
      /how\s+to\s+book\s+(an?\s+)?appointment/,
      /book\s+(a\s+)?lawyer/,
      /consultation\s+kaise\s+hoti/,
      /lawyer\s+appointment\s+kaise/,
      /appointment\s+kaise\s+lein/,
      /appointment\s+booking/,
      /وکیل\s+سے\s+ملاقات/,
      /appointment\s+book/,
    ];
    if (appointmentPatterns.some((p) => p.test(q))) {
      return {
        matched: true,
        topic: 'appointment',
        caseType: 'General Guidance',
        answer: this.faqAppointmentAnswer(language),
      };
    }

    const firPatterns = [
      /fir\s+kaise\s+file/,
      /police\s+complaint\s+kaise/,
      /how\s+to\s+file\s+(an?\s+)?fir/,
      /fir\s+register/,
      /police\s+report\s+kaise/,
      /ایف\s*آ\s*آ\s*آر/,
      /thana\s+mein\s+report/,
      /police\s+station\s+complaint/,
    ];
    if (firPatterns.some((p) => p.test(q))) {
      return {
        matched: true,
        topic: 'fir',
        caseType: 'Criminal Law',
        answer: this.faqFirAnswer(language),
      };
    }

    const guidancePatterns = [
      /what\s+should\s+i\s+do\s+(in\s+)?(a\s+)?case/,
      /legal\s+help\s+kaise\s+milegi/,
      /how\s+to\s+get\s+legal\s+(help|guidance)/,
      /legal\s+guidance\s+kaise/,
      /قانونی\s+مدد\s+کیسے/,
      /case\s+mein\s+kya\s+karna/,
      /lawyer\s+consultation\s+process/,
      /legal\s+advice\s+kaise/,
    ];
    if (guidancePatterns.some((p) => p.test(q))) {
      return {
        matched: true,
        topic: 'legal_guidance',
        caseType: 'General Guidance',
        answer: this.faqLegalGuidanceAnswer(language),
      };
    }

    return { matched: false };
  }

  private faqAppointmentAnswer(language: 'english' | 'urdu' | 'roman_urdu'): string {
    if (language === 'urdu') {
      return [
        'LawyersKonnect پر appointment book کرنے کے steps:',
        '1) Verified lawyer منتخب کریں (practice area اور city دیکھیں)',
        '2) Available slot منتخب کریں',
        '3) Booking confirm کریں',
        '4) اگر payment required ہو تو checkout مکمل کریں',
        '5) Appointment day پر lawyer سے consultation کریں',
      ].join('\n');
    }
    if (language === 'roman_urdu') {
      return [
        'LawyersKonnect par appointment book karne ke steps:',
        '1) Verified lawyer select karein (practice area aur city dekhein)',
        '2) Available slot choose karein',
        '3) Booking confirm karein',
        '4) Agar payment required ho to checkout complete karein',
        '5) Appointment day par lawyer se consultation karein',
      ].join('\n');
    }
    return [
      'How to book a lawyer appointment on LawyersKonnect:',
      '1) Browse and select a verified lawyer (check practice area and city)',
      '2) Choose an available consultation slot',
      '3) Confirm your booking details',
      '4) Complete payment if required for the consultation',
      '5) Attend the appointment and discuss your case with the lawyer',
    ].join('\n');
  }

  private faqFirAnswer(language: 'english' | 'urdu' | 'roman_urdu'): string {
    if (language === 'urdu') {
      return [
        'FIR / police complaint filing — general process (Pakistan):',
        '1) متعلقہ police station جائیں (جurisdiction وہیں ہو جہاں واقعہ ہوا)',
        '2) تحریری یا زبانی incident details دیں (تاریخ، وقت، فریقین)',
        '3) FIR درج کروانے کی درخواست کریں',
        '4) FIR copy حاصل کریں اور محفوظ رکھیں',
        '5) مزید legal advice کے لیے verified criminal lawyer سے consultation book کریں',
      ].join('\n');
    }
    if (language === 'roman_urdu') {
      return [
        'FIR / police complaint filing — general process (Pakistan):',
        '1) Mutalliqa police station jayein (jurisdiction wahan ho jahan waqia hua)',
        '2) Likhi ya zubani incident details dein (date, time, parties)',
        '3) FIR darj karwane ki darkhwast karein',
        '4) FIR ki copy hasil karein aur mehfooz rakhein',
        '5) Mazeed legal advice ke liye verified criminal lawyer se consultation book karein',
      ].join('\n');
    }
    return [
      'How to file an FIR / police complaint in Pakistan (general guidance):',
      '1) Go to the relevant police station (jurisdiction where the incident occurred)',
      '2) Provide incident details — date, time, parties involved, and facts',
      '3) Request registration of an FIR',
      '4) Obtain a copy of the FIR and keep it safe',
      '5) For case-specific advice, book a consultation with a verified criminal lawyer on LawyersKonnect',
    ].join('\n');
  }

  private faqLegalGuidanceAnswer(language: 'english' | 'urdu' | 'roman_urdu'): string {
    if (language === 'urdu') {
      return [
        'Legal help / guidance — general steps:',
        '1) اپنا مسئلہ واضح الفاظ میں بیان کریں',
        '2) تمام documents اور timeline تیار رکھیں',
        '3) LawyersKonnect AI guidance سے initial information حاصل کریں',
        '4) Verified lawyer سے consultation book کریں',
        '5) Case-specific strategy کے لیے professional legal advice لیں',
      ].join('\n');
    }
    if (language === 'roman_urdu') {
      return [
        'Legal help / guidance — general steps:',
        '1) Apna masla wazeh alfaaz mein bayan karein',
        '2) Tamam documents aur timeline tayar rakhein',
        '3) LawyersKonnect AI guidance se initial information hasil karein',
        '4) Verified lawyer se consultation book karein',
        '5) Case-specific strategy ke liye professional legal advice lein',
      ].join('\n');
    }
    return [
      'How to get legal help on LawyersKonnect:',
      '1) Clearly describe your legal issue',
      '2) Gather all relevant documents and a timeline of events',
      '3) Use AI Legal Guidance for initial general information',
      '4) Book a consultation with a verified lawyer matched to your case type',
      '5) Follow professional legal advice for your specific situation',
    ].join('\n');
  }

  async getHistoryForUser(userId: string) {
    const rows = await this.legalChatHistoryModel.find({ userId }).sort({ createdAt: -1 }).limit(30).lean().exec();
    return { success: true, data: rows };
  }

  private isFaissWeak(results: FaissSearchResult[]): boolean {
    if (results.length === 0) return true;
    return (results[0]?.score ?? 0) < FAISS_WEAK_SCORE;
  }

  private mergeContext(
    faissResults: FaissSearchResult[],
    mongoDocs: Awaited<ReturnType<LegalKnowledgeService['searchLegalKnowledge']>>,
  ): LegalSection[] {
    const key = (s: { title?: string; sectionNumber?: string; source?: string; actName?: string }) =>
      `${(s.title || '').toLowerCase()}|${(s.sectionNumber || '').toLowerCase()}|${(s.actName || s.source || '').toLowerCase()}`;
    const map = new Map<string, LegalSection>();

    for (const r of faissResults) {
      const act = this.isInternalRef(r.actName || '') ? this.humanizeCitation({
        title: r.title,
        actName: r.actName,
        sectionNumber: r.sectionNumber,
        summary: r.summary || r.content.slice(0, 400),
      }) : r.actName || r.title;
      map.set(key(r), {
        title: this.isInternalRef(r.title) ? act || 'Pakistan Code' : r.title,
        actName: act || undefined,
        sectionNumber: r.sectionNumber || undefined,
        source: 'Pakistan Code',
        summary: this.sanitizePublicText(r.summary || r.content.slice(0, 400)),
      });
    }
    for (const k of mongoDocs) {
      const entry: LegalSection = {
        title: k.title,
        actName: k.actName || undefined,
        sectionNumber: k.sectionNumber || undefined,
        source: k.source || undefined,
        sourceUrl: k.sourceUrl || undefined,
        summary: k.summary || k.content.slice(0, 400),
      };
      if (!map.has(key(entry))) map.set(key(entry), entry);
    }

    return Array.from(map.values()).slice(0, 10);
  }

  private resolveProvider(): 'ollama' | 'openai' | 'limited' {
    const envProvider = (this.config.get<string>('AI_LEGAL_PROVIDER') || 'openai').toLowerCase();
    const ollamaEnabled = this.config.get<string>('OLLAMA_ENABLED') !== 'false';
    const hasOpenAi = !!this.config.get<string>('OPENAI_API_KEY');

    if (envProvider === 'ollama' && ollamaEnabled) return 'ollama';
    if (hasOpenAi) return 'openai';
    if (ollamaEnabled) return 'ollama';
    return 'limited';
  }

  private computeConfidence(faissResults: FaissSearchResult[], mongoCount: number, usedAi: boolean): number {
    const topScore = faissResults[0]?.score ?? 0;
    const mongoBoost = Math.min(0.25, mongoCount * 0.03);
    const aiBoost = usedAi ? 0.12 : 0;
    const raw = topScore * 0.65 + mongoBoost + aiBoost + (faissResults.length > 0 ? 0.05 : 0);
    return Math.min(0.99, Math.max(0.1, Math.round(raw * 100) / 100));
  }

  private normalizeLanguage(input?: string): 'english' | 'urdu' | 'roman_urdu' {
    if (input === 'urdu') return 'urdu';
    if (input === 'roman_urdu') return 'roman_urdu';
    return 'english';
  }

  private detectMessageLanguage(text: string): 'english' | 'urdu' | 'roman_urdu' | null {
    const t = String(text || '').trim();
    if (!t) return null;
    if (/[\u0600-\u06FF]/.test(t)) return 'urdu';
    if (
      /\b(aap|mujhe|batao|kaun|kya|kaise|masla|maslay|chori|churi|paise|pese|wakil|vakeel|kaun\s+sa|kis\s+category|yeh|yah|ho\s+gaya|ho\s+gayi|mera|meri|karo|suggest)\b/i.test(
        t,
      )
    ) {
      return 'roman_urdu';
    }
    return 'english';
  }

  private userWantsLawyerSuggestion(text: string): boolean {
    const t = String(text || '').toLowerCase();
    if (
      /(?:lawyer|wakil|vakeel|وکیل)/i.test(t) &&
      /(?:suggest|recommend|batao|dikhao|dikha|find|search|dhundh|dhoondh|chahiye|chahiay|book|hire|consult|kaun|kon|best|verified|nearby|pass|qareeb|sasta|affordable|list|show|de\s+do|dedo|mil\s+jaye)/i.test(
        t,
      )
    ) {
      return true;
    }
    if (
      /(?:suggest|recommend)\s+(?:\w+\s+){0,4}(?:lawyer|wakil|vakeel)|(?:lawyer|wakil|vakeel)\s+suggest|lawyer\s+suggest|suggest\s+lawyer|wakil\s+batao|lawyer\s+batao|lawyer\s+dikhao|kaun\s+sa\s+lawyer|kon\s+sa\s+lawyer|lawyer\s+kaun/i.test(
        t,
      )
    ) {
      return true;
    }
    if (/need\s+(?:a\s+)?lawyer|find\s+(?:a\s+)?lawyer|looking\s+for\s+(?:a\s+)?lawyer|recommend\s+(?:a\s+)?lawyer|which\s+lawyer|best\s+lawyer|verified\s+lawyer|lawyer\s+choose/i.test(t)) {
      return true;
    }
    if (
      /(?:budget\s+kam|kam\s+budget|sasta|affordable|low\s+budget|fee\s+kam|mera\s+budget)/i.test(t) &&
      /(?:suggest|recommend|batao|dikhao|lawyer|wakil|vakeel|chahiye)/i.test(t)
    ) {
      return true;
    }
    if (/(?:ke?\s+liye|k\s+liye|liye)\s+(?:\w+\s+){0,3}(?:lawyer|wakil|vakeel)|(?:lawyer|wakil|vakeel)\s+(?:\w+\s+){0,2}(?:suggest|dhoondh|dhundh|chahiye)\s+kro/i.test(t)) {
      return true;
    }
    return false;
  }

  private shouldUseDirectLawyerSuggestionPath(text: string, caseText: string): boolean {
    if (caseText) return false;
    if (!this.userWantsLawyerSuggestion(text)) return false;
    const t = String(text).toLowerCase();
    const wordCount = t.split(/\s+/).filter(Boolean).length;
    const lawyerFocused =
      /(?:lawyer|wakil|vakeel)\s+(?:suggest|batao|dhoondh|dhundh|chahiye|dikhao)|(?:suggest|dhoondh|dhundh|batao|recommend).*(?:lawyer|wakil|vakeel)|(?:ke?\s+liye|k\s+liye).*(?:lawyer|wakil|vakeel)/i.test(
        t,
      );
    if (lawyerFocused && wordCount <= 18) return true;
    if (
      /(?:process|procedure|kaise\s+hota|kya\s+hota|rights|haq|explain|samjha|guidance|rehnumai)/i.test(t) &&
      !lawyerFocused
    ) {
      return false;
    }
    return lawyerFocused || wordCount <= 14;
  }

  private detectCityFromText(text: string): string | undefined {
    const t = String(text || '').toLowerCase();
    for (const city of Object.keys(this.pkCityCoords)) {
      const re = new RegExp(`\\b${city}\\b`, 'i');
      if (re.test(t)) return city.charAt(0).toUpperCase() + city.slice(1);
    }
    return undefined;
  }

  /**
   * Profile/GPS city is used for lawyer search only when the user mentions location or asks for nearby lawyers.
   * Prevents repeating "Lahore" in every guidance reply when city is only stored in settings.
   */
  private resolveGuidanceLocation(
    searchQuery: string,
    body: ChatBody,
    userAskedForLawyers: boolean,
  ): { searchCtx: LawyerLocationContext; llmCity?: string; mentionCityInAnswer: boolean } {
    const locationCtx = this.getLocationContext(body);
    const cityFromMessage = this.detectCityFromText(searchQuery);
    const profileCity = String(locationCtx.city || '').trim();
    const mentionedInText =
      Boolean(cityFromMessage) ||
      (profileCity.length > 0 &&
        new RegExp(`\\b${profileCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(searchQuery));
    const nearbyIntent = /(?:near me|nearby|qareeb|pass ke|meray shehar|mere city|in my city)/i.test(searchQuery);
    const mentionCityInAnswer = mentionedInText || nearbyIntent;

    const searchCtx: LawyerLocationContext = { ...locationCtx };
    if (cityFromMessage) {
      searchCtx.city = cityFromMessage;
    } else if (!userAskedForLawyers && !mentionCityInAnswer) {
      searchCtx.city = undefined;
      searchCtx.latitude = undefined;
      searchCtx.longitude = undefined;
    }

    const llmCity = mentionCityInAnswer ? cityFromMessage || profileCity || undefined : undefined;

    return { searchCtx, llmCity, mentionCityInAnswer };
  }

  private shouldAttachCaseCategoryLabel(text: string, userAskedForLawyers: boolean): boolean {
    if (userAskedForLawyers) return true;
    return this.userWantsCaseCategory(text);
  }

  private sanitizeNextStepsForLocation(
    steps: string[],
    mentionCityInAnswer: boolean,
    city?: string,
  ): string[] {
    if (mentionCityInAnswer) return steps;
    const filtered = steps.filter(
      (s) =>
        !/confirm whether you need help in/i.test(s) &&
        !/(?:city courts?|agency\/registration matter)/i.test(s) &&
        !/help in\s+[A-Za-z]+\s+city/i.test(s) &&
        !/browse verified/i.test(s),
    );
    if (!city?.trim()) return filtered;
    const cityRe = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    return filtered.map((s) => s.replace(cityRe, '').replace(/\s{2,}/g, ' ').trim()).filter(Boolean);
  }

  private stripUnrequestedCityMentions(answer: string, mentionCityInAnswer: boolean): string {
    if (mentionCityInAnswer || !answer.trim()) return answer;
    let out = answer;
    for (const city of Object.keys(this.pkCityCoords)) {
      const c = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`I can help with[^.]*\\bin\\s+${c}\\b[^.]*\\.`, 'gi'), '');
      out = out.replace(new RegExp(`\\bin\\s+${c}\\b`, 'gi'), 'in Pakistan');
      out = out.replace(new RegExp(`\\b${c}\\b`, 'gi'), '');
    }
    return out.replace(/\s{2,}/g, ' ').replace(/\.\s*\./g, '.').trim();
  }

  private formatCategoryLabel(category: string, language: 'english' | 'urdu' | 'roman_urdu'): string {
    if (category === 'General Guidance' || category === 'Other' || !category) {
      return language === 'urdu' ? 'عام قانونی' : language === 'roman_urdu' ? 'general legal' : 'general legal';
    }
    return category;
  }

  private buildLawyerSuggestionResponse(
    language: 'english' | 'urdu' | 'roman_urdu',
    category: string,
    lawyers: LegalChatResponse['suggested_lawyers'],
    locationCtx: LawyerLocationContext,
    prefs: LawyerSearchPreferences,
  ): LegalChatResponse {
    const label = this.formatCategoryLabel(category, language);
    const city = locationCtx.city?.trim();
    const count = lawyers.length;
    const nearbyCount = lawyers.filter((l) => l.nearby).length;
    let answer: string;
    let nextSteps: string[];

    if (language === 'urdu') {
      const cityPart = city
        ? nearbyCount > 0
          ? `${city} میں `
          : `${city} میں اس کیٹگری کے verified lawyer نہیں ملے — app میں دوسرے شہروں سے `
        : '';
      answer = `${label} کے لیے ${cityPart}نیچے ${count} verified lawyer${count > 1 ? 's' : ''} suggest کیے گئے ہیں۔ Profile دیکھیں اور consultation book کریں۔`;
      if (prefs.budgetSensitive) {
        answer += ' Aapke budget ke mutabiq lower fee wale lawyers pehle dikhaye gaye hain.';
      }
      nextSteps = [
        'Neeche diye gaye lawyer profiles compare karein',
        'Consultation fee aur rating check karein',
        'Pasandeeda lawyer se appointment book karein',
      ];
    } else if (language === 'roman_urdu') {
      const cityPart = city
        ? nearbyCount > 0
          ? `${city} mein `
          : `${city} mein is category ke verified lawyer nahi mile — app mein doosre shehron se `
        : '';
      answer = `${label} ke liye ${cityPart}neeche ${count} verified lawyer${count > 1 ? 's' : ''} suggest kiye gaye hain. Profile dekhen aur consultation book karein.`;
      if (prefs.budgetSensitive) {
        answer += ' Aapke budget ke mutabiq kam fee wale lawyers pehle dikhaye gaye hain.';
      }
      nextSteps = [
        'Neeche diye gaye lawyer profiles compare karein',
        'Consultation fee aur rating check karein',
        'Pasandeeda lawyer se appointment book karein',
      ];
    } else {
      const cityPart = city
        ? nearbyCount > 0
          ? `in ${city} `
          : `no verified ${label} lawyers in ${city} — showing from other cities in the app `
        : '';
      answer = `For ${label}, ${cityPart}${count} verified lawyer${count > 1 ? 's are' : ' is'} listed below. Open a profile to book a consultation.`;
      if (prefs.budgetSensitive) {
        answer += ' Lower-fee verified lawyers are listed first based on your budget preference.';
      }
      nextSteps = [
        'Compare the suggested lawyer profiles below',
        'Check consultation fee and rating',
        'Book an appointment with your preferred lawyer',
      ];
    }

    return {
      answer,
      case_type: category === 'General Guidance' ? '' : category,
      next_steps: nextSteps,
      suggested_lawyers: lawyers.slice(0, 3),
      confidence: 0.98,
      faq_used: false,
    };
  }

  private buildNoLawyersInCategoryResponse(
    language: 'english' | 'urdu' | 'roman_urdu',
    category: string,
    locationCtx: LawyerLocationContext,
  ): LegalChatResponse {
    const label = this.formatCategoryLabel(category, language);
    const city = locationCtx.city?.trim();
    let answer: string;
    let nextSteps: string[];

    if (language === 'urdu') {
      answer = city
        ? `Filhaal LawyersKonnect par **${label}** ke ${city} mein koi verified lawyer available nahi hai.`
        : `Filhaal LawyersKonnect par **${label}** category ke koi verified lawyer available nahi hain.`;
      answer +=
        ' Jab is category ke lawyers platform par add hon ge, yahan suggest ho sakte hain. Aap general legal guidance ke liye apna masla describe kar sakte hain.';
      nextSteps = [
        'Baad mein dubara lawyer suggest karne ko poochein',
        'Find Lawyer section check karein jab naye verified lawyers add hon',
        'Apna legal masla yahan describe karein taake guidance mil sake',
      ];
    } else if (language === 'roman_urdu') {
      answer = city
        ? `Filhaal LawyersKonnect par **${label}** ke ${city} mein koi verified lawyer available nahi hai.`
        : `Filhaal LawyersKonnect par **${label}** category ke koi verified lawyer available nahi hain.`;
      answer +=
        ' Jab is category ke lawyers platform par add hon ge, yahan suggest ho sakte hain. Aap apna legal masla describe kar ke guidance le sakte hain.';
      nextSteps = [
        'Baad mein dubara lawyer suggest karne ko poochein',
        'Find Lawyer section check karein jab naye verified lawyers add hon',
        'Apna legal masla yahan likhein taake guidance mil sake',
      ];
    } else {
      answer = city
        ? `There are currently no verified **${label}** lawyers in ${city} on LawyersKonnect.`
        : `There are currently no verified lawyers for **${label}** on LawyersKonnect.`;
      answer +=
        ' When lawyers in this category are added to the platform, they can be suggested here. You can still describe your legal issue for guidance.';
      nextSteps = [
        'Ask again later to check for newly verified lawyers',
        'Browse the Find Lawyer section when new profiles are added',
        'Describe your legal issue here for general guidance',
      ];
    }

    return {
      answer,
      case_type: category === 'General Guidance' ? '' : category,
      next_steps: nextSteps,
      suggested_lawyers: [],
      confidence: 0.95,
      faq_used: false,
    };
  }

  private userWantsCaseCategory(text: string): boolean {
    const t = String(text || '').toLowerCase();
    return /(?:kis\s+category|kaun\s+sa\s+case|case\s+type|category\s+kya|category\s+batao|konsi\s+category|kon\s+si\s+category|which\s+category|what\s+category|fall\s+under|kis\s+type)/i.test(
      t,
    );
  }

  private userWantsCategoryOrLawyerSuggestion(text: string): boolean {
    return this.userWantsLawyerSuggestion(text) || this.userWantsCaseCategory(text);
  }

  private detectLawyerPreferences(text: string): LawyerSearchPreferences {
    const t = String(text || '').toLowerCase();
    const prefs: LawyerSearchPreferences = {};

    const amountPatterns = [
      /(?:budget|fee|afford|under|below|max|upto|up\s+to|kam\s+se\s+kam|tak)\s*(?:rs\.?|pkr|rupees?)?\s*(\d[\d,]*)/i,
      /(\d[\d,]*)\s*(?:rs\.?|pkr|rupees?)\s*(?:budget|tak|max|fee|se\s+kam|tak\s+ka)/i,
      /(?:rs\.?|pkr)\s*(\d[\d,]*)/i,
    ];
    for (const pattern of amountPatterns) {
      const match = t.match(pattern);
      if (match?.[1]) {
        const amount = Number.parseInt(match[1].replace(/,/g, ''), 10);
        if (!Number.isNaN(amount) && amount > 0) {
          prefs.maxBudget = amount;
          prefs.budgetSensitive = true;
          break;
        }
      }
    }

    if (
      !prefs.budgetSensitive &&
      /(budget\s+kam|kam\s+budget|sasta|sasti|affordable|cheap|low\s+budget|fee\s+kam|kam\s+fee|kam\s+paise|paise\s+kam|limited\s+budget|munasib|ghar\s+budget|kam\s+kharch|sasta\s+lawyer|sasta\s+wakil|kam\s+fee\s+wala)/i.test(
        t,
      )
    ) {
      prefs.budgetSensitive = true;
    }

    if (
      /(best\s+rated|top\s+rated|high\s+rating|achha\s+lawyer|best\s+lawyer|behtareen|highly\s+rated|acha\s+wakil|best\s+review|top\s+lawyer|rating\s+achi)/i.test(
        t,
      )
    ) {
      prefs.prioritizeRating = true;
    }

    return prefs;
  }

  private resolveLawyerPreferences(body: ChatBody, text: string): LawyerSearchPreferences {
    const detected = this.detectLawyerPreferences(text);
    const bodyBudget = body.maxBudget != null ? Number(body.maxBudget) : undefined;
    const maxBudget =
      bodyBudget != null && !Number.isNaN(bodyBudget) && bodyBudget > 0
        ? bodyBudget
        : detected.maxBudget;
    return {
      maxBudget,
      budgetSensitive: Boolean(detected.budgetSensitive || maxBudget),
      prioritizeRating: detected.prioritizeRating,
    };
  }

  private getCategorySearchTerms(category: string): string[] {
    const aliases: Record<string, string[]> = {
      'Criminal Law': ['Criminal Law', 'Criminal', 'FIR', 'Penal', 'Theft'],
      'Family Law': ['Family Law', 'Family', 'Divorce', 'Marriage', 'Custody'],
      'Property Law': ['Property Law', 'Property', 'Land', 'Real Estate'],
      'Rent Law': ['Rent Law', 'Rent', 'Tenant', 'Landlord', 'Tenancy'],
      'Labour Law': ['Labour Law', 'Labor Law', 'Employment', 'Labour'],
      'Contract Law': ['Contract Law', 'Contract', 'Agreement'],
      'Consumer Law': ['Consumer Law', 'Consumer'],
      'Tax Law': ['Tax Law', 'Tax'],
      'Banking Law': ['Banking Law', 'Banking', 'Bank'],
      'Business Law': ['Business Law', 'Business', 'Corporate'],
      'Civil Law': ['Civil Law', 'Civil'],
      'Intellectual Property': ['Intellectual Property', 'IP', 'Copyright', 'Trademark', 'Patent'],
    };
    return aliases[category] || [category];
  }

  private ensureCategoryInAnswer(
    answer: string,
    caseType: string,
    language: 'english' | 'urdu' | 'roman_urdu',
  ): string {
    const markers = [
      caseType.toLowerCase(),
      caseType.replace(/\s+Law$/i, '').toLowerCase(),
      'criminal',
      'family',
      'intellectual',
      'copyright',
      'trademark',
    ];
    if (markers.some((m) => answer.toLowerCase().includes(m))) return answer;
    if (language === 'urdu') {
      return `**آپ کا مسئلہ ${caseType} کی کیٹگری میں آتا ہے۔**\n\n${answer}`;
    }
    if (language === 'roman_urdu') {
      return `**Aap ka masla ${caseType} category mein aata hai.**\n\n${answer}`;
    }
    return `**Your issue falls under ${caseType}.**\n\n${answer}`;
  }

  private ensureLawyerHintInAnswer(answer: string, language: 'english' | 'urdu' | 'roman_urdu'): string {
    if (/(lawyer|wakil|vakeel|consultation|book|نیچے|neeche|listed below)/i.test(answer)) return answer;
    if (language === 'urdu') {
      return `${answer}\n\nنیچے اس کیٹگری کے تصدیق شدہ وکلاء دکھائے گئے ہیں — آپ ان سے مشاورت بک کر سکتے ہیں۔`;
    }
    if (language === 'roman_urdu') {
      return `${answer}\n\nNeeche app mein is category ke verified lawyers suggest kiye gaye hain — aap un se consultation book kar sakte hain.`;
    }
    return `${answer}\n\nVerified lawyers for this case type are listed below — you can book a consultation with them in the app.`;
  }

  private detectCategoryFromText(text: string): string {
    const t = String(text || '').toLowerCase();
    if (
      /(intellectual property|\bip\b|copyright|trademark|patent|trade secret|design infringement|brand name dispute|unfair competition)/i.test(
        t,
      )
    ) {
      return 'Intellectual Property';
    }
    if (/(divorce|custody|marriage|family|khula|talaq|نکاح|طلاق|خلع|بچوں کی کفالت|وراثت)/i.test(t)) return 'Family Law';
    if (/(tenant|rent|landlord|kiraya|evict|vacate|khali|کرایہ|مکان|کرایہ دار|خالی)/i.test(t)) return 'Rent Law';
    if (/(property transfer|registry|mutation|ownership|real estate|زمین|جائیداد|پلاٹ|\bplot\b|\bghar\b)/i.test(t)) return 'Property Law';
    if (
      /(fir|arrest|bail|criminal|theft|chori|churi|chor\b|chori\s+ho|paise\s+chor|pese\s+chor|paisa\s+chor|money\s+stolen|loot|luut|snatch|dakait|dacoit|robbery|wallet|purse|mobile\s+chor|phone\s+stolen|police|thana|جُرم|گرفتار|ضمانت|مقدمہ|چوری|ڈکیتی|لوٹ)/i.test(
        t,
      )
    ) {
      return 'Criminal Law';
    }
    if (/(job|salary|employment|worker|company job|hr|termination|dismissal|نوکری|تنخواہ|ملازمت)/i.test(t)) return 'Labour Law';
    if (/(agreement|contract|breach|nda|service contract|معاہدہ|کنٹریکٹ)/i.test(t)) return 'Contract Law';
    if (/(consumer|refund|defective|warranty|fraud purchase|صارف|ریفنڈ)/i.test(t)) return 'Consumer Law';
    if (/(tax|fbr|income tax|sales tax|withholding|ٹیکس)/i.test(t)) return 'Tax Law';
    if (/(bank|loan|interest|default|cheque bounce|بینک|قرض)/i.test(t)) return 'Banking Law';
    if (/(company|business|partnership|llc|compliance|کاروبار|شراکت)/i.test(t)) return 'Business Law';
    if (/(civil suit|injunction|damages|declaration|دیوانی)/i.test(t)) return 'Civil Law';
    return 'Other';
  }

  private async callLlm(
    provider: 'ollama' | 'openai',
    language: 'english' | 'urdu' | 'roman_urdu',
    msg: string,
    caseText: string,
    body: ChatBody,
    humanContext: Array<{ citation: string; summary: string }>,
    caseType: string,
    suggestedLawyers: LegalChatResponse['suggested_lawyers'],
    allowLong: boolean,
    userAskedForLawyers: boolean,
    mentionCityInAnswer: boolean,
    llmCity?: string,
  ) {
    const system = this.buildSystemPrompt(language, allowLong);
    const detectedCategory = caseType !== 'Other' ? caseType : body.preferredPracticeArea || '';
    const lawyerPrefs = this.resolveLawyerPreferences(body, `${msg}\n${caseText}`);
    const userAskedForCaseCategory = this.userWantsCaseCategory(`${msg}\n${caseText}`);
    const userPrompt = JSON.stringify(
      {
        message: msg,
        caseText: caseText ? caseText.slice(0, 6000) : undefined,
        location: mentionCityInAnswer ? body.location : undefined,
        latitude: mentionCityInAnswer ? body.latitude : undefined,
        longitude: mentionCityInAnswer ? body.longitude : undefined,
        citizenCity: llmCity,
        mentionCityInAnswer,
        lawyerSearchPreferences: userAskedForLawyers ? lawyerPrefs : undefined,
        preferredPracticeArea: body.preferredPracticeArea,
        detectedAppCategory: detectedCategory || undefined,
        userAskedForCaseCategory,
        userAskedForLawyers,
        suggestedLawyersForBooking: userAskedForLawyers
          ? suggestedLawyers.slice(0, 3).map((l) => ({
              name: l.name,
              city: l.city,
              practiceAreas: l.practiceAreas,
              rating: l.rating,
              consultationFee: l.consultationFee,
              distanceKm: l.distanceKm,
              nearby: l.nearby,
              withinBudget: l.withinBudget,
            }))
          : [],
        pakistanLawContext: humanContext.slice(0, 5),
        hasIndexedLawContext: humanContext.length > 0,
      },
      null,
      2,
    );

    if (provider === 'ollama') return this.callOllama(system, userPrompt);
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new HttpException('OpenAI API key not configured', HttpStatus.SERVICE_UNAVAILABLE);
    return this.callOpenAi(system, userPrompt, apiKey);
  }

  private buildSystemPrompt(language: 'english' | 'urdu' | 'roman_urdu', allowLong: boolean) {
    const langMap: Record<string, string> = { english: 'English', urdu: 'Urdu', roman_urdu: 'Roman Urdu' };
    const lengthRule = allowLong
      ? 'Up to 400 words if needed.'
      : 'Keep the answer concise: 150-220 words maximum.';
    return `You are LawyersKonnect AI Legal Guidance Assistant for Pakistan.
SCOPE (strict): You ONLY answer Pakistani legal guidance, lawyer category suggestions, verified lawyer booking help, and LawyersKonnect platform usage. If the user asks about unrelated topics (school/university subjects, homework, operation research, math, science tutorials, programming help, recipes, entertainment, weather, or general knowledge), do NOT answer that topic. Politely refuse and invite them to ask a legal question instead.
Write like ChatGPT: warm, clear, conversational — not like a search engine or API.
Answer directly about Pakistani law. This is not a substitute for hiring a lawyer — but never say "general legal information", "general legal guidance", "general legal info", or similar boilerplate.

pakistanLawContext (if present) is internal background from Pakistani statutes — use it when helpful.
If pakistanLawContext is empty or does not cover the question, still answer using sound knowledge of Pakistani law.
NEVER tell the user that references were missing, insufficient, wrong, or not provided.
NEVER mention: PDFs, uploads, datasets, RAG, chunks, legalReferences, pakistanLawContext, "the reference you gave", or backend sources.
NEVER use phrases like: "general legal information", "general legal guidance", "for general informational purposes only", or "(general legal info)".
When citing law, write naturally (e.g. "Under the Contract Act, 1872…" or "Article 23 — Right to Property") without saying it came from a document or reference file.
Do not say "according to the provided reference" or "this was not in your reference".
LOCATION: If mentionCityInAnswer is false, do NOT mention any city (e.g. Lahore, Karachi) in your answer or next steps — even if citizenCity is absent. Never open with "I can help you in [city]". Do not ask the user to confirm city courts or agency location unless they asked about a specific city.
When mentionCityInAnswer is true, you may reference that city at most once, briefly.
When detectedAppCategory is provided and userAskedForCaseCategory is true, open your answer by clearly naming that LawyersKonnect practice area (e.g. "Criminal Law") in plain language.
If userAskedForLawyers is false, do NOT mention lawyers listed below, booking a lawyer, verified lawyers in the app, or lawyer suggestions — only give legal guidance.
If userAskedForLawyers is true AND suggestedLawyersForBooking has entries, give a SHORT answer (2-4 sentences max) and say verified lawyers are listed below — do NOT ask for FIR number, offence details, budget forms, or long hiring checklists.
If userAskedForLawyers is true AND suggestedLawyersForBooking is empty, say briefly that no verified lawyers for that category are currently on the platform — do not invent lawyers or ask for case intake forms.
If userAskedForLawyers is true AND suggestedLawyersForBooking has entries, prefer mentioning nearby lawyers when mentionCityInAnswer is true and citizenCity is provided.
When userAskedForLawyers is true and lawyerSearchPreferences.budgetSensitive or maxBudget is set, explain that suggested lawyers are chosen to fit the citizen's budget (lower fees first, still verified).
When userAskedForLawyers is true and lawyerSearchPreferences.prioritizeRating is true, highlight that suggestions favor highly rated verified lawyers.
When userAskedForLawyers is true, mention consultation fee and rating naturally when relevant — do not invent numbers not present in suggestedLawyersForBooking.
${lengthRule}
Respond in ${langMap[language]}.
Return strict JSON only:
{"answer":"conversational explanation string","nextSteps":["actionable step 1","step 2","step 3"]}`;
  }

  private async callOpenAi(system: string, userPrompt: string, apiKey: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const isOpenRouterKey = apiKey.startsWith('sk-or-v1-');
      const endpoint = isOpenRouterKey
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      };
      if (isOpenRouterKey) {
        headers['HTTP-Referer'] = this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';
        headers['X-Title'] = 'LawyersKonnect Legal Guidance';
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini',
          temperature: 0.2,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpException('AI provider request failed', HttpStatus.BAD_GATEWAY);
      const content = raw?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new HttpException('Invalid AI response', HttpStatus.BAD_GATEWAY);
      return JSON.parse(content);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callOllama(system: string, userPrompt: string) {
    const base = (this.config.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434').replace(/\/$/, '');
    const model = this.config.get<string>('OLLAMA_MODEL') || 'llama3';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpException(`Ollama error: ${res.status}`, HttpStatus.BAD_GATEWAY);
      const content = raw?.message?.content;
      if (typeof content !== 'string') throw new HttpException('Invalid Ollama response', HttpStatus.BAD_GATEWAY);
      return JSON.parse(content);
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildLimitedAnswer(language: 'english' | 'urdu' | 'roman_urdu', caseType: string): string {
    if (language === 'urdu') {
      return `آپ کے سوال کے مطابق ممکنہ کیس کی قسم: ${caseType}۔ عمومی رہنمائی کے لیے دستاویزات تیار رکھیں اور تصدیق شدہ وکیل سے مشورہ کریں۔`;
    }
    if (language === 'roman_urdu') {
      return `Aap ke maslay ki mumkin case type: ${caseType}. Documents tayar rakhein aur verified lawyer se consultation book karein.`;
    }
    return `Likely case type: ${caseType}. I recommend gathering your documents, reviewing your options, and booking a consultation with a verified lawyer for advice tailored to your situation.`;
  }

  private async saveHistory(
    userId: string,
    question: string,
    response: LegalChatResponse,
    language: string,
    mongoDocs: Awaited<ReturnType<LegalKnowledgeService['searchLegalKnowledge']>>,
  ) {
    const suggestedLawyerIds = response.suggested_lawyers.reduce<Types.ObjectId[]>((acc, l) => {
      if (Types.ObjectId.isValid(l._id)) acc.push(new Types.ObjectId(l._id));
      return acc;
    }, []);
    await this.legalChatHistoryModel.create({
      userId: new Types.ObjectId(userId),
      question: question.slice(0, 5000),
      answer: response.answer.slice(0, 5000),
      language,
      category: response.case_type,
      urgency: 'low',
      legalReferenceIds: mongoDocs.map((k) => k._id as Types.ObjectId),
      suggestedLawyerIds,
    });
  }

  async searchVerifiedLawyersForCase(
    category: string,
    locationCtx?: LawyerLocationContext,
    prefs: LawyerSearchPreferences = {},
    options: { strictCategory?: boolean; preferCity?: boolean } = {},
  ) {
    const { strictCategory = false, preferCity = false } = options;
    const safeCategory = String(category || '').trim();
    const isGeneral =
      !safeCategory || safeCategory === 'General Guidance' || safeCategory === 'Other' || safeCategory === 'General';
    const citizenCoords = this.resolveCitizenCoords(locationCtx);
    const cityTerms = locationCtx?.city ? this.getCityMatchTerms(locationCtx.city) : [];
    const baseQuery: Record<string, unknown> = {
      role: UserRole.LAWYER,
      isActive: true,
      'lawyerProfile.verificationStatus': VerificationStatus.VERIFIED,
    };

    const buildAreaQuery = (terms: string[]) => {
      const regexes = terms.map(
        (term) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      );
      if (regexes.length === 1) return { ...baseQuery, 'lawyerProfile.practiceAreas': regexes[0] };
      return {
        ...baseQuery,
        $or: regexes.map((regex) => ({ 'lawyerProfile.practiceAreas': regex })),
      };
    };

    const selectFields =
      '_id lawyerProfile.fullName lawyerProfile.city lawyerProfile.practiceAreas lawyerProfile.averageRating lawyerProfile.yearsOfExperience lawyerProfile.consultationFee lawyerProfile.latitude lawyerProfile.longitude';

    let docs: any[] = [];
    if (!isGeneral) {
      const terms = this.getCategorySearchTerms(safeCategory);
      docs = await this.userModel.find(buildAreaQuery(terms)).select(selectFields).limit(50).lean().exec();
    }
    if (!docs.length && !strictCategory) {
      docs = await this.userModel.find(baseQuery).select(selectFields).limit(50).lean().exec();
    }
    if (!docs.length) return [];

    const scored = docs.map((u: any) => {
      const city = String(u?.lawyerProfile?.city || '');
      const sameCity = cityTerms.length ? cityTerms.some((term) => new RegExp(term, 'i').test(city)) : false;
      const lat = u?.lawyerProfile?.latitude;
      const lng = u?.lawyerProfile?.longitude;
      let distanceKm: number | null = null;
      if (
        citizenCoords &&
        typeof lat === 'number' &&
        !Number.isNaN(lat) &&
        typeof lng === 'number' &&
        !Number.isNaN(lng)
      ) {
        distanceKm = this.calculateDistanceKm(citizenCoords.latitude, citizenCoords.longitude, lat, lng);
      }
      const rating = Number(u?.lawyerProfile?.averageRating || 0);
      const exp = Number(u?.lawyerProfile?.yearsOfExperience || 0);
      const feeRaw = u?.lawyerProfile?.consultationFee;
      const fee = typeof feeRaw === 'number' && !Number.isNaN(feeRaw) ? feeRaw : null;
      const withinBudget = prefs.maxBudget != null && fee != null ? fee <= prefs.maxBudget : undefined;

      let score = 0;
      if (prefs.budgetSensitive && !prefs.prioritizeRating) {
        if (fee != null) score += Math.max(0, 220 - fee / 40);
        else score += 40;
        score += rating * 12 + exp * 0.8;
        if (withinBudget) score += 120;
        else if (prefs.maxBudget != null && fee != null && fee > prefs.maxBudget) score -= 80;
      } else if (prefs.prioritizeRating) {
        score += rating * 28 + exp * 1.2;
        if (fee != null) score += Math.max(0, 30 - fee / 500);
      } else {
        score += rating * 18 + exp * 1.5;
        if (fee != null) score += Math.max(0, 40 - fee / 300);
      }

      if (distanceKm != null) score += Math.max(0, 200 - distanceKm * 4);
      else if (sameCity) score += 80;

      const nearby = (distanceKm != null && distanceKm <= 50) || sameCity;
      return { u, score, distanceKm, nearby, withinBudget, fee };
    });

    let ranked = [...scored];
    if (prefs.maxBudget != null) {
      const within = ranked.filter((item) => item.fee != null && item.fee <= prefs.maxBudget!);
      if (within.length) ranked = within;
    }

    ranked.sort((a, b) => {
      if (prefs.budgetSensitive && !prefs.prioritizeRating) {
        const feeA = a.fee ?? Number.MAX_SAFE_INTEGER;
        const feeB = b.fee ?? Number.MAX_SAFE_INTEGER;
        if (feeA !== feeB) return feeA - feeB;
      }
      return b.score - a.score;
    });

    if (preferCity && cityTerms.length) {
      const inCity = ranked.filter((item) => {
        const city = String(item.u?.lawyerProfile?.city || '');
        return cityTerms.some((term) => new RegExp(term, 'i').test(city)) || item.nearby;
      });
      if (inCity.length) ranked = inCity;
    }

    return ranked.slice(0, 5).map(({ u, distanceKm, nearby, withinBudget }) => ({
      _id: String(u._id),
      name: u?.lawyerProfile?.fullName || 'Lawyer',
      city: u?.lawyerProfile?.city || '',
      practiceAreas: Array.isArray(u?.lawyerProfile?.practiceAreas) ? u.lawyerProfile.practiceAreas : [],
      experienceYears: u?.lawyerProfile?.yearsOfExperience,
      rating: u?.lawyerProfile?.averageRating,
      consultationFee: u?.lawyerProfile?.consultationFee,
      profileUrl: `/lawyers/${String(u._id)}`,
      distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
      nearby,
      withinBudget: withinBudget === true,
    }));
  }

  private normalizeChatBody(body: ChatBody): ChatBody {
    const latitude = body.latitude != null ? Number(body.latitude) : undefined;
    const longitude = body.longitude != null ? Number(body.longitude) : undefined;
    const maxBudget = body.maxBudget != null ? Number(body.maxBudget) : undefined;
    return {
      ...body,
      latitude: latitude != null && !Number.isNaN(latitude) ? latitude : undefined,
      longitude: longitude != null && !Number.isNaN(longitude) ? longitude : undefined,
      maxBudget: maxBudget != null && !Number.isNaN(maxBudget) && maxBudget > 0 ? maxBudget : undefined,
    };
  }

  private getLocationContext(body: ChatBody): LawyerLocationContext {
    const city = String(body.location || '').trim();
    const latitude = typeof body.latitude === 'number' && !Number.isNaN(body.latitude) ? body.latitude : undefined;
    const longitude = typeof body.longitude === 'number' && !Number.isNaN(body.longitude) ? body.longitude : undefined;
    return { city: city || undefined, latitude, longitude };
  }

  private readonly pkCityCoords: Record<string, { latitude: number; longitude: number }> = {
    karachi: { latitude: 24.8607, longitude: 67.0011 },
    lahore: { latitude: 31.5204, longitude: 74.3587 },
    islamabad: { latitude: 33.6844, longitude: 73.0479 },
    rawalpindi: { latitude: 33.5651, longitude: 73.0169 },
    faisalabad: { latitude: 31.4504, longitude: 73.135 },
    multan: { latitude: 30.1575, longitude: 71.5249 },
    peshawar: { latitude: 34.0151, longitude: 71.5249 },
    quetta: { latitude: 30.1798, longitude: 66.975 },
    sialkot: { latitude: 32.4945, longitude: 74.5229 },
    gujranwala: { latitude: 32.1877, longitude: 74.1945 },
    hyderabad: { latitude: 25.396, longitude: 68.3578 },
    abbottabad: { latitude: 34.1688, longitude: 73.2215 },
  };

  private getCityMatchTerms(city: string): string[] {
    const raw = String(city || '').trim();
    if (!raw) return [];
    const lower = raw.toLowerCase();
    const canonical = Object.keys(this.pkCityCoords).find((key) => lower.includes(key) || key.includes(lower));
    if (canonical) return [canonical, canonical.charAt(0).toUpperCase() + canonical.slice(1)];
    return [raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')];
  }

  private resolveCitizenCoords(locationCtx?: LawyerLocationContext): { latitude: number; longitude: number } | null {
    if (!locationCtx) return null;
    const { latitude, longitude, city } = locationCtx;
    if (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      !Number.isNaN(latitude) &&
      !Number.isNaN(longitude)
    ) {
      return { latitude, longitude };
    }
    if (city) {
      const lower = city.trim().toLowerCase();
      const key = Object.keys(this.pkCityCoords).find((k) => lower.includes(k) || k.includes(lower));
      if (key) return this.pkCityCoords[key];
    }
    return null;
  }

  private calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const earthRadiusKm = 6371;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  private async extractDocumentText(file: Express.Multer.File): Promise<string> {
    const name = String(file.originalname || '').toLowerCase();
    try {
      if (name.endsWith('.txt')) return file.buffer.toString('utf8').slice(0, 15000);
      if (name.endsWith('.pdf')) {
        const { PDFParse } = await import('pdf-parse');
        const pdfParser = new PDFParse({ data: file.buffer });
        try {
          const result = await pdfParser.getText();
          const text = String(result?.text || '').trim();
          if (!text) {
            throw new HttpException(
              { code: 'DOCUMENT_TEXT_EXTRACTION_FAILED', message: 'Could not extract readable text from PDF.' },
              HttpStatus.BAD_REQUEST,
            );
          }
          return text.slice(0, 15000);
        } finally {
          await pdfParser.destroy().catch(() => undefined);
        }
      }
      if (name.endsWith('.docx') || name.endsWith('.doc')) {
        const parsed = await mammoth.extractRawText({ buffer: file.buffer });
        if (!parsed?.value?.trim()) {
          throw new HttpException(
            { code: 'DOCUMENT_TEXT_EXTRACTION_FAILED', message: 'Could not extract readable text from DOC/DOCX.' },
            HttpStatus.BAD_REQUEST,
          );
        }
        return parsed.value.slice(0, 15000);
      }
      throw new HttpException(
        { code: 'UNSUPPORTED_DOCUMENT_TYPE', message: 'Unsupported file. Use TXT, PDF, DOC, or DOCX.' },
        HttpStatus.BAD_REQUEST,
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { code: 'DOCUMENT_TEXT_EXTRACTION_FAILED', message: 'Document text extraction failed.' },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
