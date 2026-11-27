use std::sync::atomic::{AtomicBool, Ordering};

// The main WebView supplies its persisted language before opening the library.
static ENGLISH: AtomicBool = AtomicBool::new(false);

pub fn set(english: bool) {
    ENGLISH.store(english, Ordering::Relaxed);
}

pub fn tr(chinese: &'static str, english: &'static str) -> &'static str {
    if ENGLISH.load(Ordering::Relaxed) {
        english
    } else {
        chinese
    }
}
