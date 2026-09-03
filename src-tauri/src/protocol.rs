use crate::session::{ProcessEvent, SessionInfo, SpawnSpec};
use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};

pub(crate) const PROTOCOL_VERSION: u32 = 1;

const MAX_FRAME: usize = 8 * 1024 * 1024;

mod tag {
    pub(super) const HELLO: u8 = 0x01;
    pub(super) const LIST: u8 = 0x02;
    pub(super) const KILL_VIEW: u8 = 0x03;
    pub(super) const OPEN: u8 = 0x10;
    pub(super) const INPUT: u8 = 0x11;
    pub(super) const RESIZE: u8 = 0x12;
    pub(super) const DETACH: u8 = 0x13;
    pub(super) const KILL: u8 = 0x14;

    pub(super) const HELLO_OK: u8 = 0x81;
    pub(super) const VERSION_MISMATCH: u8 = 0x82;
    pub(super) const SESSIONS: u8 = 0x83;
    pub(super) const ERROR: u8 = 0x84;
    pub(super) const OK: u8 = 0x85;
    pub(super) const SNAPSHOT: u8 = 0x90;
    pub(super) const DATA: u8 = 0x91;
    pub(super) const PROCESS: u8 = 0x92;
    pub(super) const EXIT: u8 = 0x93;
    pub(super) const DETACHED: u8 = 0x94;
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Hello {
    pub(crate) protocol: u32,
    pub(crate) app_data_dir: std::path::PathBuf,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Open {
    pub(crate) view_id: String,
    pub(crate) rows: u16,
    pub(crate) cols: u16,
    pub(crate) spec: Option<SpawnSpec>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Resize {
    pub(crate) rows: u16,
    pub(crate) cols: u16,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ViewId {
    pub(crate) view_id: String,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum DetachReason {
    Stolen,
    Killed,
}

#[derive(Debug)]
pub(crate) enum ClientFrame {
    Hello(Hello),
    List,
    KillView(ViewId),
    Open(Open),
    Input(Vec<u8>),
    Resize(Resize),
    Detach,
    Kill,
}

#[derive(Debug)]
pub(crate) enum DaemonFrame {
    HelloOk { version: u32 },
    VersionMismatch { version: u32 },
    Sessions(Vec<SessionInfo>),
    Error { message: String },
    Ok,
    Snapshot(Vec<u8>),
    Data(Vec<u8>),
    Process(ProcessEvent),
    Exit { status: Option<i32> },
    Detached { reason: DetachReason },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Version {
    version: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Message {
    message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Exit {
    status: Option<i32>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Detached {
    reason: DetachReason,
}

fn json(value: &impl Serialize) -> Vec<u8> {
    serde_json::to_vec(value).unwrap_or_else(|_| b"null".to_vec())
}

fn parse<T: serde::de::DeserializeOwned>(payload: &[u8]) -> io::Result<T> {
    serde_json::from_slice(payload)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

fn unknown(tag: u8) -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidData,
        format!("unknown frame tag {tag:#04x}"),
    )
}

pub(crate) fn write_frame(writer: &mut impl Write, tag: u8, payload: &[u8]) -> io::Result<()> {
    if payload.len() > MAX_FRAME {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "frame payload too large",
        ));
    }
    let mut header = [0_u8; 5];
    header[0] = tag;
    header[1..].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    writer.write_all(&header)?;
    writer.write_all(payload)?;
    writer.flush()
}

pub(crate) fn read_frame(reader: &mut impl Read) -> io::Result<(u8, Vec<u8>)> {
    let mut header = [0_u8; 5];
    reader.read_exact(&mut header)?;
    let length = u32::from_le_bytes([header[1], header[2], header[3], header[4]]) as usize;
    if length > MAX_FRAME {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "frame payload too large",
        ));
    }
    let mut payload = vec![0_u8; length];
    reader.read_exact(&mut payload)?;
    Ok((header[0], payload))
}

impl ClientFrame {
    pub(crate) fn encode(&self) -> (u8, Vec<u8>) {
        match self {
            Self::Hello(hello) => (tag::HELLO, json(hello)),
            Self::List => (tag::LIST, Vec::new()),
            Self::KillView(view) => (tag::KILL_VIEW, json(view)),
            Self::Open(open) => (tag::OPEN, json(open)),
            Self::Input(bytes) => (tag::INPUT, bytes.clone()),
            Self::Resize(resize) => (tag::RESIZE, json(resize)),
            Self::Detach => (tag::DETACH, Vec::new()),
            Self::Kill => (tag::KILL, Vec::new()),
        }
    }

    pub(crate) fn decode(tag: u8, payload: Vec<u8>) -> io::Result<Self> {
        Ok(match tag {
            tag::HELLO => Self::Hello(parse(&payload)?),
            tag::LIST => Self::List,
            tag::KILL_VIEW => Self::KillView(parse(&payload)?),
            tag::OPEN => Self::Open(parse(&payload)?),
            tag::INPUT => Self::Input(payload),
            tag::RESIZE => Self::Resize(parse(&payload)?),
            tag::DETACH => Self::Detach,
            tag::KILL => Self::Kill,
            other => return Err(unknown(other)),
        })
    }

    pub(crate) fn write(&self, writer: &mut impl Write) -> io::Result<()> {
        let (tag, payload) = self.encode();
        write_frame(writer, tag, &payload)
    }

    pub(crate) fn read(reader: &mut impl Read) -> io::Result<Self> {
        let (tag, payload) = read_frame(reader)?;
        Self::decode(tag, payload)
    }
}

impl DaemonFrame {
    pub(crate) fn encode(&self) -> (u8, Vec<u8>) {
        match self {
            Self::HelloOk { version } => (tag::HELLO_OK, json(&Version { version: *version })),
            Self::VersionMismatch { version } => {
                (tag::VERSION_MISMATCH, json(&Version { version: *version }))
            }
            Self::Sessions(sessions) => (tag::SESSIONS, json(sessions)),
            Self::Error { message } => (
                tag::ERROR,
                json(&Message {
                    message: message.clone(),
                }),
            ),
            Self::Ok => (tag::OK, Vec::new()),
            Self::Snapshot(bytes) => (tag::SNAPSHOT, bytes.clone()),
            Self::Data(bytes) => (tag::DATA, bytes.clone()),
            Self::Process(event) => (tag::PROCESS, json(event)),
            Self::Exit { status } => (tag::EXIT, json(&Exit { status: *status })),
            Self::Detached { reason } => (tag::DETACHED, json(&Detached { reason: *reason })),
        }
    }

    pub(crate) fn decode(tag: u8, payload: Vec<u8>) -> io::Result<Self> {
        Ok(match tag {
            tag::HELLO_OK => Self::HelloOk {
                version: parse::<Version>(&payload)?.version,
            },
            tag::VERSION_MISMATCH => Self::VersionMismatch {
                version: parse::<Version>(&payload)?.version,
            },
            tag::SESSIONS => Self::Sessions(parse(&payload)?),
            tag::ERROR => Self::Error {
                message: parse::<Message>(&payload)?.message,
            },
            tag::OK => Self::Ok,
            tag::SNAPSHOT => Self::Snapshot(payload),
            tag::DATA => Self::Data(payload),
            tag::PROCESS => Self::Process(parse(&payload)?),
            tag::EXIT => Self::Exit {
                status: parse::<Exit>(&payload)?.status,
            },
            tag::DETACHED => Self::Detached {
                reason: parse::<Detached>(&payload)?.reason,
            },
            other => return Err(unknown(other)),
        })
    }

    pub(crate) fn write(&self, writer: &mut impl Write) -> io::Result<()> {
        let (tag, payload) = self.encode();
        write_frame(writer, tag, &payload)
    }

    pub(crate) fn read(reader: &mut impl Read) -> io::Result<Self> {
        let (tag, payload) = read_frame(reader)?;
        Self::decode(tag, payload)
    }

    pub(crate) fn weight(&self) -> usize {
        match self {
            Self::Snapshot(bytes) | Self::Data(bytes) => bytes.len(),
            _ => 64,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        read_frame, write_frame, ClientFrame, DaemonFrame, DetachReason, Hello, Open, Resize,
        PROTOCOL_VERSION,
    };
    use std::io::Cursor;

    fn roundtrip_client(frame: &ClientFrame) -> ClientFrame {
        let mut buffer = Vec::new();
        frame.write(&mut buffer).unwrap();
        ClientFrame::read(&mut Cursor::new(buffer)).unwrap()
    }

    fn roundtrip_daemon(frame: &DaemonFrame) -> DaemonFrame {
        let mut buffer = Vec::new();
        frame.write(&mut buffer).unwrap();
        DaemonFrame::read(&mut Cursor::new(buffer)).unwrap()
    }

    #[test]
    fn frames_survive_a_roundtrip() {
        let hello = roundtrip_client(&ClientFrame::Hello(Hello {
            protocol: PROTOCOL_VERSION,
            app_data_dir: "/data".into(),
        }));
        assert!(matches!(hello, ClientFrame::Hello(hello) if hello.protocol == PROTOCOL_VERSION));

        let open = roundtrip_client(&ClientFrame::Open(Open {
            view_id: "view".into(),
            rows: 24,
            cols: 80,
            spec: None,
        }));
        assert!(matches!(open, ClientFrame::Open(open) if open.cols == 80 && open.spec.is_none()));

        let input = roundtrip_client(&ClientFrame::Input(b"ls\r".to_vec()));
        assert!(matches!(input, ClientFrame::Input(bytes) if bytes == b"ls\r"));

        let resize = roundtrip_client(&ClientFrame::Resize(Resize { rows: 40, cols: 100 }));
        assert!(matches!(resize, ClientFrame::Resize(resize) if resize.rows == 40));

        let data = roundtrip_daemon(&DaemonFrame::Data(vec![0, 159, 146, 150]));
        assert!(matches!(data, DaemonFrame::Data(bytes) if bytes == [0, 159, 146, 150]));

        let detached = roundtrip_daemon(&DaemonFrame::Detached {
            reason: DetachReason::Stolen,
        });
        assert!(matches!(
            detached,
            DaemonFrame::Detached {
                reason: DetachReason::Stolen
            }
        ));

        let exit = roundtrip_daemon(&DaemonFrame::Exit { status: Some(3) });
        assert!(matches!(exit, DaemonFrame::Exit { status: Some(3) }));
    }

    #[test]
    fn data_frames_are_not_json_encoded() {
        let mut buffer = Vec::new();
        DaemonFrame::Data(b"raw".to_vec())
            .write(&mut buffer)
            .unwrap();
        assert_eq!(&buffer[5..], b"raw");
    }

    #[test]
    fn unknown_tags_are_rejected_rather_than_misparsed() {
        let mut buffer = Vec::new();
        write_frame(&mut buffer, 0x7f, b"{}").unwrap();
        let (tag, payload) = read_frame(&mut Cursor::new(buffer)).unwrap();
        assert!(ClientFrame::decode(tag, payload).is_err());
    }

    #[test]
    fn oversized_lengths_are_refused_before_allocating() {
        let mut buffer = vec![super::tag::DATA];
        buffer.extend_from_slice(&u32::MAX.to_le_bytes());
        assert!(read_frame(&mut Cursor::new(buffer)).is_err());
    }
}
