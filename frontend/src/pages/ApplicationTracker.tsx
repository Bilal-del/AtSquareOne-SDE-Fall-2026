
function ApplicationTracker() {
    const applications = [
        {
            id: 1,
            company: 'Example Tech',
            position: 'Frontend Developer',
            status: 'Applied',
            date: '2026-10-15'
        },
        {
            id: 2,
            company: 'Secure Systems',
            position: 'Cybersecurity Analyst',
            status: 'Interviewing',
            date: '2026-10-18'
        },
        {
            id: 3,
            company: 'Future Software',
            position: 'Software Engineer Intern',
            status: 'Rejected',
            date: '2026-10-20'
        }
    ];

    return (
        <section>
            <h1>Application Tracker</h1>
            <p>Track the status of your job applications.</p>

            {applications.map((application) => (
                <div className="job-card" key={application.id}>
                    <h2>{application.position}</h2>
                    <p><strong>Company:</strong> {application.company}</p>
                    <p><strong>Status:</strong> {application.status}</p>
                    <p><strong>Applied On:</strong> {application.date}</p>
                </div>
            ))}
        </section>
    );
}

export default ApplicationTracker;
