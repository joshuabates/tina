//! Text processor with configurable transformations

/// Configuration for the processor
#[derive(Debug, Clone, Default)]
pub struct ProcessorConfig {
    /// Convert text to uppercase
    pub uppercase: bool,
    /// Trim whitespace
    pub trim: bool,
    /// Prefix to add to output
    pub prefix: Option<String>,
}

/// Text processor that applies transformations
#[derive(Debug)]
pub struct Processor {
    config: ProcessorConfig,
}

impl Processor {
    /// Create a new processor with the given config
    pub fn new(config: ProcessorConfig) -> Self {
        Self { config }
    }

    /// Create a processor with default config
    pub fn with_defaults() -> Self {
        Self::new(ProcessorConfig::default())
    }

    /// Process input text according to configuration
    pub fn process(&self, input: &str) -> String {
        let mut result = input.to_string();

        if self.config.trim {
            result = result.trim().to_string();
        }

        if self.config.uppercase {
            result = result.to_uppercase();
        }

        if let Some(prefix) = &self.config.prefix {
            result = format!("{}{}", prefix, result);
        }

        result
    }

    /// Process multiple lines
    pub fn process_lines(&self, lines: &[&str]) -> Vec<String> {
        lines.iter().map(|line| self.process(line)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_processor() {
        let processor = Processor::with_defaults();
        assert_eq!(processor.process("hello"), "hello");
    }

    #[test]
    fn test_uppercase() {
        let processor = Processor::new(ProcessorConfig {
            uppercase: true,
            ..Default::default()
        });
        assert_eq!(processor.process("hello"), "HELLO");
    }

    #[test]
    fn test_trim() {
        let processor = Processor::new(ProcessorConfig {
            trim: true,
            ..Default::default()
        });
        assert_eq!(processor.process("  hello  "), "hello");
    }

    #[test]
    fn test_prefix() {
        let processor = Processor::new(ProcessorConfig {
            prefix: Some("[OUT] ".to_string()),
            ..Default::default()
        });
        assert_eq!(processor.process("hello"), "[OUT] hello");
    }

    #[test]
    fn test_combined_transformations() {
        let processor = Processor::new(ProcessorConfig {
            uppercase: true,
            trim: true,
            prefix: Some(">> ".to_string()),
        });
        assert_eq!(processor.process("  hello world  "), ">> HELLO WORLD");
    }

    #[test]
    fn test_process_lines() {
        let processor = Processor::new(ProcessorConfig {
            uppercase: true,
            ..Default::default()
        });
        let result = processor.process_lines(&["hello", "world"]);
        assert_eq!(result, vec!["HELLO", "WORLD"]);
    }
}
