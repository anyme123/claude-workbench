/// Windows Job Object Management
///
/// This module provides Windows Job Object functionality to ensure that
/// all child processes are terminated when the parent process exits or
/// when we explicitly close the job.
///
/// Job Objects are a Windows-specific mechanism for managing groups of processes.
/// When a process is assigned to a job with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
/// all processes in the job are automatically terminated when the job handle is closed.

#[cfg(windows)]
pub mod windows_job {
    use log::{debug, info};
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::System::JobObjects::*;
    use windows::Win32::System::Threading::*;

    /// Wrapper for Windows Job Object handle
    /// Automatically closes the job when dropped, which kills all processes
    pub struct JobObject {
        handle: HANDLE,
    }

    impl JobObject {
        /// Create a new Job Object with automatic process termination on close
        pub fn create() -> Result<Self, String> {
            unsafe {
                // Create an unnamed job object
                let handle = CreateJobObjectW(None, None)
                    .map_err(|e| format!("Failed to create job object: {:?}", e))?;

                if handle.is_invalid() {
                    return Err("Created job object is invalid".to_string());
                }

                info!("Created Windows Job Object with handle: {:?}", handle);

                // Set job limits to kill all processes when the job is closed
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();

                // Set the flag to kill on job close
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

                let result = SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const _,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );

                if let Err(e) = result {
                    let _ = CloseHandle(handle);
                    return Err(format!("Failed to set job object limits: {:?}", e));
                }

                debug!("Set JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE flag successfully");

                Ok(JobObject { handle })
            }
        }

        /// Assign a process to this Job Object
        ///
        /// # Arguments
        /// * `process_handle` - Native Windows process handle (HANDLE)
        pub fn assign_process(&self, process_handle: HANDLE) -> Result<(), String> {
            unsafe {
                AssignProcessToJobObject(self.handle, process_handle)
                    .map_err(|e| format!("Failed to assign process to job: {:?}", e))?;

                info!(
                    "Assigned process {:?} to job object {:?}",
                    process_handle, self.handle
                );
                Ok(())
            }
        }

        /// Assign a process to this Job Object using PID
        ///
        /// # Arguments
        /// * `pid` - Process ID
        pub fn assign_process_by_pid(&self, pid: u32) -> Result<(), String> {
            unsafe {
                // Open process handle with necessary permissions
                let process_handle = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid)
                    .map_err(|e| format!("Failed to open process {}: {:?}", pid, e))?;

                if process_handle.is_invalid() {
                    return Err(format!("Invalid process handle for PID {}", pid));
                }

                // Assign to job
                let result = self.assign_process(process_handle);

                // Close the process handle (job keeps its own reference)
                let _ = CloseHandle(process_handle);

                result
            }
        }

        /// Terminate all processes in the job
        #[allow(dead_code)]
        pub fn terminate_all(&self, exit_code: u32) -> Result<(), String> {
            unsafe {
                TerminateJobObject(self.handle, exit_code)
                    .map_err(|e| format!("Failed to terminate job: {:?}", e))?;

                info!("Terminated all processes in job object");
                Ok(())
            }
        }

        /// Get the raw HANDLE for advanced operations
        #[allow(dead_code)]
        pub fn handle(&self) -> HANDLE {
            self.handle
        }
    }

    impl Drop for JobObject {
        fn drop(&mut self) {
            unsafe {
                debug!("Dropping JobObject, this will terminate all child processes");
                // Closing the handle will automatically terminate all processes
                // due to JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE flag
                let _ = CloseHandle(self.handle);
                info!("Closed job object handle, all child processes terminated");
            }
        }
    }

    // Ensure JobObject is Send and Sync for use in async contexts
    unsafe impl Send for JobObject {}
    unsafe impl Sync for JobObject {}
}

#[cfg(not(windows))]
#[allow(dead_code)]
pub mod windows_job {
    /// Dummy JobObject for non-Windows platforms
    pub struct JobObject;

    impl JobObject {
        pub fn create() -> Result<Self, String> {
            // No-op on non-Windows platforms
            Ok(JobObject)
        }

        pub fn assign_process_by_pid(&self, _pid: u32) -> Result<(), String> {
            // No-op on non-Windows platforms
            Ok(())
        }

        pub fn terminate_all(&self, _exit_code: u32) -> Result<(), String> {
            // No-op on non-Windows platforms
            Ok(())
        }
    }
}
