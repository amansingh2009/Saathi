import type { Language } from "@/store/preferences";

const strings = {
  en: {
    appName: "saathi", welcome: "Your caring companion, always with you.",
    subtitle: "A helping hand for everyday life.\nMade simple. Made for you.",
    chooseLanguage: "Choose your language", continue: "Continue", back: "Back",
    hello: "Good morning", talk: "Talk to Saathi", tasks: "Today’s tasks",
    medicines: "Medicines", family: "Family", profile: "Profile", home: "Home",
    assistant: "Saathi is listening", ask: "How can I help you today?",
    noTasks: "No tasks for today", noMedicines: "No medicines scheduled",
    sos: "Emergency help", sosConfirm: "Would you like to alert your family?",
    cancel: "Cancel", confirm: "Confirm", loading: "Loading…", retry: "Try again",
    signIn: "Sign in", signUp: "Create account", email: "Email", password: "Password",
    caregiver: "I’m helping a family member", elderly: "I’d like some support",
  },
  hi: {
    appName: "साथी", welcome: "आपका साथी, हमेशा आपके साथ।",
    subtitle: "हर दिन के लिए एक मददगार हाथ।\nसरल और आपके लिए।",
    chooseLanguage: "अपनी भाषा चुनें", continue: "आगे बढ़ें", back: "वापस",
    hello: "सुप्रभात", talk: "साथी से बात करें", tasks: "आज के काम",
    medicines: "दवाइयाँ", family: "परिवार", profile: "प्रोफ़ाइल", home: "होम",
    assistant: "साथी सुन रहा है", ask: "आज मैं आपकी कैसे मदद करूँ?",
    noTasks: "आज के लिए कोई काम नहीं", noMedicines: "आज कोई दवा तय नहीं है",
    sos: "आपातकालीन सहायता", sosConfirm: "क्या आप अपने परिवार को सूचना देना चाहते हैं?",
    cancel: "रद्द करें", confirm: "पुष्टि करें", loading: "लोड हो रहा है…", retry: "फिर कोशिश करें",
    signIn: "साइन इन", signUp: "खाता बनाएँ", email: "ईमेल", password: "पासवर्ड",
    caregiver: "मैं परिवार के सदस्य की मदद कर रहा/रही हूँ", elderly: "मुझे सहायता चाहिए",
  },
  ta: {
    appName: "சாத்தி", welcome: "எப்போதும் உங்களுடன் இருக்கும் அன்பான துணை.",
    subtitle: "அன்றாட வாழ்க்கைக்கு ஒரு உதவும் கை.\nஎளிமையாக, உங்களுக்காக.",
    chooseLanguage: "உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்", continue: "தொடரவும்", back: "பின்னால்",
    hello: "காலை வணக்கம்", talk: "சாத்தியுடன் பேசுங்கள்", tasks: "இன்றைய பணிகள்",
    medicines: "மருந்துகள்", family: "குடும்பம்", profile: "சுயவிவரம்", home: "முகப்பு",
    assistant: "சாத்தி கேட்கிறார்", ask: "இன்று நான் உங்களுக்கு எப்படி உதவலாம்?",
    noTasks: "இன்றைக்கு பணிகள் இல்லை", noMedicines: "இன்று மருந்துகள் திட்டமிடப்படவில்லை",
    sos: "அவசர உதவி", sosConfirm: "உங்கள் குடும்பத்திற்கு எச்சரிக்கை அனுப்பவா?",
    cancel: "ரத்து", confirm: "உறுதிப்படுத்து", loading: "ஏற்றுகிறது…", retry: "மீண்டும் முயற்சி",
    signIn: "உள்நுழை", signUp: "கணக்கை உருவாக்கு", email: "மின்னஞ்சல்", password: "கடவுச்சொல்",
    caregiver: "நான் குடும்ப உறுப்பினருக்கு உதவுகிறேன்", elderly: "எனக்கு ஆதரவு வேண்டும்",
  },
} satisfies Record<Language, Record<string, string>>;

export function t(language: Language, key: keyof (typeof strings)["en"]): string {
  return strings[language][key] ?? strings.en[key];
}
