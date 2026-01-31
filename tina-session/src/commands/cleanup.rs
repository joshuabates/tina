use tina_session::session::lookup::SessionLookup;

pub fn run(feature: &str) -> anyhow::Result<u8> {
    if !SessionLookup::exists(feature) {
        println!("Feature '{}' not found.", feature);
        return Ok(1);
    }

    SessionLookup::delete(feature)?;
    println!("Removed lookup file for '{}'", feature);
    Ok(0)
}
