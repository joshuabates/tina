//! Integration tests for test-project

use test_project::{Processor, ProcessorConfig};

#[test]
fn test_processor_integration() {
    let config = ProcessorConfig {
        uppercase: true,
        trim: true,
        prefix: Some("=> ".to_string()),
    };
    let processor = Processor::new(config);

    let input = vec!["  hello  ", "  world  "];
    let output = processor.process_lines(&input);

    assert_eq!(output, vec!["=> HELLO", "=> WORLD"]);
}

#[test]
fn test_processor_empty_input() {
    let processor = Processor::with_defaults();
    let result = processor.process("");
    assert_eq!(result, "");
}

#[test]
fn test_processor_preserves_newlines_in_content() {
    let processor = Processor::with_defaults();
    // Single string with embedded newline should preserve it
    let result = processor.process("line1\nline2");
    assert_eq!(result, "line1\nline2");
}
