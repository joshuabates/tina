use chrono::{DateTime, Utc};

/// Calculate duration in minutes between two timestamps.
pub fn duration_mins(start: DateTime<Utc>, end: DateTime<Utc>) -> i64 {
    let duration = end.signed_duration_since(start);
    duration.num_minutes()
}

/// Calculate duration in minutes from a start time to now.
pub fn duration_since(start: DateTime<Utc>) -> i64 {
    duration_mins(start, Utc::now())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    #[test]
    fn test_duration_mins() {
        let start = Utc::now();
        let end = start + Duration::minutes(45);
        assert_eq!(duration_mins(start, end), 45);
    }

    #[test]
    fn test_duration_mins_hours() {
        let start = Utc::now();
        let end = start + Duration::hours(2) + Duration::minutes(30);
        assert_eq!(duration_mins(start, end), 150);
    }
}
