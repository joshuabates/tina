//! test-project CLI
//!
//! A simple CLI for the test project processor.

use std::fs;
use std::io::{self, BufRead, Write};
use std::path::PathBuf;

use clap::Parser;
use test_project::{Processor, ProcessorConfig};

#[derive(Parser)]
#[command(name = "test-project")]
#[command(about = "Process text files with configurable transformations")]
struct Cli {
    /// Input file (reads from stdin if not provided)
    #[arg(short, long)]
    input: Option<PathBuf>,

    /// Output file (writes to stdout if not provided)
    #[arg(short, long)]
    output: Option<PathBuf>,

    /// Convert to uppercase
    #[arg(short, long)]
    uppercase: bool,

    /// Trim whitespace from lines
    #[arg(short, long)]
    trim: bool,

    /// Prefix to add to each line
    #[arg(short, long)]
    prefix: Option<String>,
}

fn main() -> io::Result<()> {
    let cli = Cli::parse();

    let config = ProcessorConfig {
        uppercase: cli.uppercase,
        trim: cli.trim,
        prefix: cli.prefix,
    };

    let processor = Processor::new(config);

    // Read input
    let lines: Vec<String> = if let Some(input_path) = cli.input {
        fs::read_to_string(&input_path)?
            .lines()
            .map(String::from)
            .collect()
    } else {
        io::stdin()
            .lock()
            .lines()
            .collect::<io::Result<Vec<_>>>()?
    };

    // Process lines
    let line_refs: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();
    let processed = processor.process_lines(&line_refs);

    // Write output
    if let Some(output_path) = cli.output {
        let mut file = fs::File::create(&output_path)?;
        for line in processed {
            writeln!(file, "{}", line)?;
        }
    } else {
        for line in processed {
            println!("{}", line);
        }
    }

    Ok(())
}
