
import { Link } from 'react-router-dom';

function JobSearch() {
    const jobs = [
        {
            id: 1,
            title: 'Frontend Developer',
            company: 'Example Tech',
            location: 'Remote'
        },
        {
            id: 2,
            title: 'Cybersecurity Analyst',
            company: 'Secure Systems',
            location: 'Chicago, IL'
        },
        {
            id: 3,
            title: 'Software Engineer Intern',
            company: 'Future Software',
            location: 'Hybrid'
        }
    ];

    return (
        <section>
            <h1>Job Search</h1>
            <p>Browse available job opportunities.</p>

            {jobs.map((job) => (
                <div className="job-card" key={job.id}>
                    <h2>{job.title}</h2>
                    <p>{job.company} — {job.location}</p>
                    <Link to={`/jobs/${job.id}`}>
                        View Details
                    </Link>
                </div>
            ))}
        </section>
    );
}

export default JobSearch;
